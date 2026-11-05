#!/usr/bin/env python3
"""An owner-only loopback setup wizard. It is never reverse-proxied by Caddy."""
import concurrent.futures
import hashlib
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
import time
import core
import progress as install_progress

PORT = 8787
ASSETS = Path(__file__).parent / 'ui'
state = core.read_json(core.STATE)
install_progress.interrupt(state)
state['busy'] = False  # An interrupted worker is resumed explicitly by its owner.
core.atomic_json(core.STATE, state)
tracker = install_progress.Tracker(state, lambda: core.atomic_json(core.STATE, state))
session = secrets.token_urlsafe(32)
pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
mutex = threading.Lock()
attempts = []


def public_state():
    keys = ['step', 'name', 'domain', 'www', 'ips', 'status', 'evidence', 'busy', 'message', 'complete', 'local_test', 'has_admin']
    return {**{k: state.get(k) for k in keys}, 'progress': install_progress.public(state.get('progress'))}


def submit(task):
    with mutex:
        if state['busy']:
            raise core.StoreError('Operasi sebelumnya masih berjalan.')
        state.update(busy=True, message='Sedang memproses. Progres tetap tersimpan jika browser ditutup.')
        core.atomic_json(core.STATE, state)

    def work():
        try:
            task()
        except Exception as error:
            state['message'] = str(error) if isinstance(error, core.StoreError) else 'Proses terhenti. Jalankan Periksa Lagi atau lanjutkan finalisasi; data tidak dihapus.'
        finally:
            state['busy'] = False
            if state.get('message', '').startswith('Sedang memproses'):
                state['message'] = ''
            core.atomic_json(core.STATE, state)
    pool.submit(work)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # No request bodies, authorization tokens or passwords in logs.

    def valid_host(self):
        return self.headers.get('Host') in [f'127.0.0.1:{PORT}', f'localhost:{PORT}']

    def authorized(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return secrets.compare_digest(cookie['store_setup'].value, session)
        except (KeyError, ValueError):
            return False

    def reply(self, code, value, mime='application/json; charset=utf-8', cookie=False):
        data = json.dumps(value).encode() if mime.startswith('application/json') else value
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'")
        if cookie:
            # HTTP is permitted exclusively on loopback/SSH tunnel, never on a public listener.
            self.send_header('Set-Cookie', f'store_setup={session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=14400')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {'error': 'Host tidak diizinkan.'})
        paths = {'/': ('index.html', 'text/html; charset=utf-8'), '/wizard.js': ('wizard.js', 'text/javascript; charset=utf-8'), '/wizard.css': ('wizard.css', 'text/css; charset=utf-8')}
        if self.path in paths:
            file, mime = paths[self.path]
            return self.reply(200, (ASSETS / file).read_bytes(), mime)
        if not self.authorized():
            return self.reply(401, {'error': 'Buka tautan setup dari terminal server.'})
        if self.path == '/api/state':
            return self.reply(200, public_state())
        self.reply(404, {'error': 'Tidak ditemukan.'})

    def do_POST(self):
        origin = self.headers.get('Origin')
        if not self.valid_host() or origin not in [f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}']:
            return self.reply(403, {'error': 'Jalur setup tidak diizinkan.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.reply(413, {'error': 'Payload tidak valid.'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError()
            if self.path == '/api/session':
                if state.get('complete'):
                    return self.reply(410, {'error': 'Setup pertama telah dinonaktifkan.'})
                now = time.monotonic()
                attempts[:] = [x for x in attempts if x > now - 60]
                if len(attempts) >= 10:
                    return self.reply(429, {'error': 'Terlalu banyak percobaan. Tunggu satu menit.'})
                attempts.append(now)
                token = data.get('token', '')
                digest = hashlib.sha256(token.encode()).hexdigest()
                if not state.get('setup_hash') or not secrets.compare_digest(digest, state['setup_hash']):
                    return self.reply(401, {'error': 'Otorisasi setup tidak valid.'})
                return self.reply(200, public_state(), cookie=True)
            if not self.authorized():
                return self.reply(401, {'error': 'Otorisasi setup diperlukan.'})
            if state.get('complete'):
                return self.reply(410, {'error': 'Setup pertama telah dinonaktifkan.'})
            if state['busy']:
                return self.reply(409, {'error': 'Operasi masih berjalan.'})
            if self.path == '/api/name':
                if state.get('bootstrap_started'):
                    raise core.StoreError('Identitas dikunci setelah finalisasi dimulai.')
                state.update(name=core.validate_name(data.get('name')), step=2, message='')
                core.atomic_json(core.STATE, state)
                def discover():
                    state['ips'] = {'ipv4': '127.0.0.1', 'ipv6': None} if state['local_test'] else core.discover_ips()
                submit(discover)
            elif self.path == '/api/domain':
                if state.get('bootstrap_started'):
                    raise core.StoreError('Domain dikunci setelah finalisasi dimulai.')
                if not state.get('name'):
                    raise core.StoreError('Isi nama toko terlebih dahulu.')
                domain = core.validate_domain(data.get('domain'), state['local_test'])
                www = bool(data.get('www')) and not state['local_test'] and not domain.startswith('www.')
                state.update(domain=domain, www=www, step=2, verified_at=None, status='Menunggu DNS diperbarui')
                # Compose requires its files to exist even when only starting the proxy.
                core.create_secrets(domain)
                def verify():
                    status, evidence = core.verify_domain(state)
                    state.update(status=status, evidence=evidence, verified_at=int(time.time()) if status == 'Domain berhasil terhubung' else None)
                submit(verify)
            elif self.path == '/api/next':
                if not state.get('verified_at') or state.get('status') != 'Domain berhasil terhubung':
                    raise core.StoreError('Domain dan HTTPS harus lulus pemeriksaan terlebih dahulu.')
                state.update(step=3, message='')
                core.atomic_json(core.STATE, state)
            elif self.path == '/api/back':
                if state.get('bootstrap_started'):
                    raise core.StoreError('Lanjutkan finalisasi instalasi yang sudah dimulai.')
                state['step'] = max(1, state['step'] - 1)
                core.atomic_json(core.STATE, state)
            elif self.path == '/api/admin':
                if state.get('step') != 3 or not state.get('verified_at'):
                    raise core.StoreError('Akun admin hanya dapat dibuat setelah domain dan HTTPS terverifikasi.')
                password = data.get('password')
                if not state.get('has_admin'):
                    email = core.validate_admin(data.get('email'), password, data.get('confirmation'))
                    if state.get('admin_email') and email != state['admin_email']:
                        raise core.StoreError('Gunakan email admin dari percobaan pertama. Password tidak pernah disimpan.')
                    state['admin_email'] = email
                def finalize():
                    tracker.begin()
                    # Recheck DNS, hostname, certificate and server challenge at the sensitive boundary.
                    with tracker.phase('verify'):
                        status, evidence = core.verify_domain(state)
                        state.update(status=status, evidence=evidence)
                        if status != 'Domain berhasil terhubung':
                            raise core.StoreError('Verifikasi domain berubah. Periksa DNS/HTTPS, lalu lanjutkan finalisasi kembali.')
                    state['bootstrap_started'] = True
                    core.atomic_json(core.STATE, state)
                    core.initialize_store(state, password, tracker)
                    core.run(['systemctl', 'disable', 'single-store-setup.service'])
                    threading.Timer(60, server.shutdown).start()
                submit(finalize)
            else:
                return self.reply(404, {'error': 'Tidak ditemukan.'})
            self.reply(200, public_state())
        except core.StoreError as error:
            self.reply(422, {'error': str(error)})
        except (ValueError, TypeError):
            self.reply(422, {'error': 'Input tidak valid.'})


if __name__ == '__main__':
    if state.get('complete'):
        raise SystemExit(0)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    server.daemon_threads = True
    server.serve_forever()
    server.server_close()
    pool.shutdown(wait=True)
