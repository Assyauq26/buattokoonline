"""Local store operations. No shell interpolation, platform account or customer telemetry."""
import base64
import copy
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

ROOT = Path('/opt/single-store')
CONFIG = Path('/etc/single-store')
DATA = Path('/var/lib/single-store')
COMPOSE = ROOT / 'deploy/compose.yaml'
STATE = CONFIG / 'setup.json'
REPO = 'Assyauq26/buattokoonline'
REPO_ID = 1446326256


class StoreError(Exception):
    pass


def atomic_json(path, value):
    path = Path(path)
    temp = path.with_suffix('.tmp')
    with open(temp, 'w', encoding='utf8') as file:
        os.chmod(temp, 0o600)
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def run(args, input=None, timeout=120, capture=True):
    result = subprocess.run([str(x) for x in args], input=input, stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None, timeout=timeout, check=False)
    if result.returncode:
        # Never return command output: it can contain DSNs, submitted data or private paths.
        raise StoreError('Operasi layanan gagal. Periksa log lokal root-only dan jalankan kembali.')
    return (result.stdout or b'').decode('utf8').strip()


def dc(args, input=None, file=None, timeout=180):
    return run(['docker', 'compose', '-f', file or COMPOSE, *args], input, timeout)


def sql(query):
    return dc(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'store', '-At', '-v', 'ON_ERROR_STOP=1'], query.encode())


def inventory(source):
    return {p.parent.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((Path(source) / 'app/prisma/migrations').glob('*/migration.sql'))}


def compose_for(source, image='installed'):
    config = json.loads((ROOT / 'manager/compose-base.json').read_text())
    for name, target in [('app', 'runtime'), ('tools', 'tools')]:
        config['services'][name]['build'] = {'context': str(Path(source) / 'app'), 'target': target}
        config['services'][name]['image'] = 'single-store-' + name + ':' + image
    return config


def validate_name(name):
    if not isinstance(name, str) or not 1 <= len(name) <= 100 or name != name.strip() or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise StoreError('Isi nama toko sepanjang 1–100 karakter tanpa karakter kontrol.')
    return name


def validate_domain(domain, local=False):
    if not isinstance(domain, str):
        raise StoreError('Domain tidak valid.')
    domain = domain.lower().strip()
    if local and domain == 'localhost':
        return domain
    if local or len(domain) > 253 or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', domain):
        raise StoreError('Isi domain tanpa https, path, atau port, misalnya tokomawar.com.')
    return domain


def validate_admin(email, password, confirmation):
    if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}', email):
        raise StoreError('Email administrator tidak valid.')
    if not isinstance(password, str) or password != confirmation or not 12 <= len(password) or len(password.encode()) > 72 or '\0' in password:
        raise StoreError('Password harus cocok, minimal 12 karakter dan maksimal 72 byte.')
    if sum(bool(re.search(pattern, password)) for pattern in [r'[a-z]', r'[A-Z]', r'[0-9]', r'[^a-zA-Z0-9]']) < 3:
        raise StoreError('Gunakan sedikitnya tiga jenis karakter: huruf kecil, huruf besar, angka, atau simbol.')
    return email.lower()


def curl(url, extra=None, timeout=15):
    return run(['curl', '--noproxy', '*', '--proto', '=https,http', '--fail', '--silent', '--show-error',
                '--connect-timeout', '5', '--max-time', str(timeout), *(extra or []), url], timeout=timeout + 3)


def public_address(raw, version):
    try:
        address = ipaddress.ip_address(raw.strip())
        return str(address) if address.version == version and address.is_global else None
    except ValueError:
        return None


def discover_ips():
    found = []
    for url in ['https://api.ipify.org', 'https://checkip.amazonaws.com']:
        try:
            address = public_address(curl(url, ['-4'], 7), 4)
            if address:
                found.append(address)
        except StoreError:
            pass
    if len(found) != 2 or len(set(found)) != 1:
        raise StoreError('IP publik belum dapat dikonfirmasi oleh dua layanan. Periksa koneksi server lalu Periksa Lagi.')
    ipv6 = None
    try:
        candidate = public_address(curl('https://api6.ipify.org', ['-6'], 5), 6)
        addresses = run(['ip', '-j', '-6', 'address', 'show', 'scope', 'global'])
        if candidate and candidate in addresses:
            ipv6 = candidate
    except StoreError:
        pass
    return {'ipv4': found[0], 'ipv6': ipv6}


def resolve(host, record, resolver):
    result = run(['dig', '+time=3', '+tries=1', '+short', '@' + resolver, host, record], timeout=6)
    version = 4 if record == 'A' else 6
    return sorted({str(ipaddress.ip_address(line)) for line in result.splitlines() if public_address(line, version)})


def dns_status(answers, ips):
    # Every returned address must belong to this server; an extra AAAA can break ACME.
    if not any(a['A'] or a['AAAA'] for a in answers):
        return 'Menunggu DNS diperbarui'
    for answer in answers:
        if any(ip != ips['ipv4'] for ip in answer['A']) or any(ip != ips.get('ipv6') for ip in answer['AAAA']):
            return 'IP domain belum sesuai'
    if any(not a['A'] for a in answers) or answers[0] != answers[1]:
        return 'Menunggu DNS diperbarui'
    return None


def write_caddy(state, live=False):
    domain, proof = state['domain'], state['proof']
    hosts = [domain] + (['www.' + domain] if state.get('www') else [])
    content = ''
    for host in hosts:
        content += f'http://{host} {{\n  handle /.well-known/store-setup/{proof} {{\n    respond "{proof}" 200\n  }}\n  handle {{\n    redir https://{host}{{uri}} permanent\n  }}\n}}\n'
        content += f'https://{host} {{\n'
        if state['local_test']:
            content += '  tls internal\n'
        content += f'  handle /.well-known/store-setup/{proof} {{\n    respond "{proof}" 200\n  }}\n'
        if host != domain:
            content += f'  handle {{\n    redir https://{domain}{{uri}} permanent\n  }}\n'
        elif live:
            content += '  handle {\n    reverse_proxy app:3000\n  }\n'
        else:
            content += '  handle {\n    respond "Toko sedang disiapkan oleh pemilik server." 503\n  }\n'
        content += '  header X-Content-Type-Options nosniff\n  header Referrer-Policy strict-origin-when-cross-origin\n}\n'
    # Existing bind mount must keep its inode; Caddy reload reads the same file.
    path = CONFIG / 'Caddyfile'
    with open(path, 'w') as file:
        os.chmod(path, 0o600)
        file.write(content)
        file.flush()
        os.fsync(file.fileno())
    dc(['up', '-d', 'proxy'])
    dc(['exec', '-T', 'proxy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'])


def verify_domain(state):
    evidence = {'time': int(time.time()), 'mode': 'LOCAL_TEST' if state['local_test'] else 'PUBLIC', 'hosts': {}}
    if state['local_test']:
        state['ips'] = {'ipv4': '127.0.0.1', 'ipv6': None}
    else:
        state['ips'] = discover_ips()
        for host in [state['domain']] + (['www.' + state['domain']] if state.get('www') else []):
            answers = [{'resolver': r, 'A': resolve(host, 'A', r), 'AAAA': resolve(host, 'AAAA', r)} for r in ['1.1.1.1', '8.8.8.8']]
            evidence['hosts'][host] = answers
            error = dns_status([{k: v for k, v in a.items() if k != 'resolver'} for a in answers], state['ips'])
            if error:
                return error, evidence
    write_caddy(state)
    proof_path = '/.well-known/store-setup/' + state['proof']
    for host in [state['domain']] + (['www.' + state['domain']] if state.get('www') else []):
        try:
            if curl('http://' + host + proof_path) != state['proof']:
                return 'Server belum dapat diakses', evidence
        except StoreError:
            return 'Server belum dapat diakses', evidence
        extra = []
        if state['local_test']:
            ca = dc(['exec', '-T', 'proxy', 'cat', '/data/caddy/pki/authorities/local/root.crt'])
            (CONFIG / 'local-test-ca.crt').write_text(ca + '\n')
            os.chmod(CONFIG / 'local-test-ca.crt', 0o600)
            extra = ['--cacert', str(CONFIG / 'local-test-ca.crt')]
        try:
            if curl('https://' + host + proof_path, extra, 20) != state['proof']:
                return 'Server belum dapat diakses', evidence
        except StoreError:
            return 'Sedang mengaktifkan HTTPS', evidence
    evidence['https'] = 'LOCAL_CA_VALID' if state['local_test'] else 'PUBLIC_CERTIFICATE_VALID'
    evidence['reachability'] = 'HTTP/HTTPS hostname and server challenge verified from the VPS; external firewall vantage still requires an independent probe.'
    return 'Domain berhasil terhubung', evidence


def create_secrets(domain):
    journal = CONFIG / 'secret-journal.json'
    required = ['postgres.env', 'runtime.env', 'migration.env', 'init.sql']
    if journal.exists():
        contents = read_json(journal)
        for name in required:
            path = CONFIG / name
            if not path.exists():
                path.write_text(contents[name])
                os.chmod(path, 0o644 if name == 'init.sql' else 0o600)
        journal.unlink()
    if all((CONFIG / name).exists() for name in required):
        path = CONFIG / 'runtime.env'
        content = path.read_text()
        for key in ['APP_ORIGIN', 'NEXT_PUBLIC_BASE_URL', 'PASSWORD_RESET_BASE_URL']:
            content = re.sub(r'^' + key + r'=.*$', key + '=https://' + domain, content, flags=re.M)
        path.write_text(content)
        return
    if any((CONFIG / name).exists() for name in ['postgres.env', 'migration.env', 'init.sql']):
        raise StoreError('Konfigurasi parsial ditemukan. Pulihkan set konfigurasi root-only; secret tidak dibuat ulang.')
    postgres, owner, app, jwt, cron = [secrets.token_hex(32) for _ in range(5)]
    contents = {
        'postgres.env': f'POSTGRES_PASSWORD={postgres}\n',
        'migration.env': f'DATABASE_URL=postgresql://store_owner:{owner}@db:5432/store\nDIRECT_URL=postgresql://store_owner:{owner}@db:5432/store\n',
        'runtime.env': f'APP_ORIGIN=https://{domain}\nNEXT_PUBLIC_BASE_URL=https://{domain}\nDATABASE_URL=postgresql://store_app:{app}@db:5432/store\nDIRECT_URL=postgresql://store_app:{app}@db:5432/store\nJWT_SECRET={jwt}\nAUTH_COOKIE_NAME=store_session\nSTORAGE_LOCAL_ROOT=/media\nJNT_INTEGRATION_ENCRYPTION_KEY={base64.b64encode(secrets.token_bytes(32)).decode()}\nCRON_SECRET={cron}\nPAYMENT_PROVIDER=manual\nSHIPPING_PROVIDER=manual\nREGION_DATA_MODE=snapshot\nPRODUCT_MEDIA_CLEANUP_ENABLED=1\nPASSWORD_RESET_BASE_URL=https://{domain}\n',
        'init.sql': f"CREATE ROLE store_owner LOGIN PASSWORD '{owner}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE ROLE store_app LOGIN PASSWORD '{app}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;\nCREATE DATABASE store OWNER store_owner;\nREVOKE CONNECT ON DATABASE store FROM PUBLIC;\nGRANT CONNECT ON DATABASE store TO store_owner, store_app;\n\\connect store\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;\n",
    }
    # A durable root-only journal preserves the same credential set across interrupted writes.
    atomic_json(journal, contents)
    for name, content in contents.items():
        path = CONFIG / name
        path.write_text(content)
        os.chmod(path, 0o644 if name == 'init.sql' else 0o600)
    journal.unlink()


def grant_runtime():
    sql('''GRANT USAGE ON SCHEMA public TO store_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO store_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM store_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO store_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO store_app;
ALTER DEFAULT PRIVILEGES FOR ROLE store_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO store_app;
ALTER DEFAULT PRIVILEGES FOR ROLE store_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO store_app;''')


def healthy(local_test=False):
    for _ in range(30):
        try:
            response = json.loads(curl('http://127.0.0.1:3000/api/v1/ready', timeout=5))
            if response.get('success'):
                return
        except (StoreError, ValueError):
            pass
        time.sleep(2)
    raise StoreError('Versi aplikasi belum sehat.')


def initialize_store(state, password=None):
    create_secrets(state['domain'])
    if not state.get('built'):
        dc(['build', 'app', 'tools'], timeout=1800)
        state['built'] = True
        atomic_json(STATE, state)
    dc(['up', '-d', '--wait', 'db'])
    dc(['run', '--rm', '-T', 'tools', 'npm', 'run', 'db:migrate'])
    existing = json.loads(sql('SELECT json_build_object(\'users\',(SELECT count(*) FROM "User"),\'identity\',(SELECT count(*) FROM "StoreAppearance"));'))
    if existing == {'users': 0, 'identity': 0}:
        if password is None:
            raise StoreError('Buat akun admin untuk melanjutkan. Password sebelumnya tidak disimpan.')
        payload = ('\0'.join([state['name'], state['admin_email'], password])).encode()
        dc(['run', '--rm', '-T', 'tools', 'npm', 'run', 'bootstrap'], payload)
        del payload
    elif not state.get('bootstrap_started') or existing['users'] != 1 or existing['identity'] != 1:
        raise StoreError('Database sudah berisi identitas lain. Bootstrap tidak dijalankan ulang.')
    else:
        # A crash after the DB commit is recovered without changing the administrator.
        if sql('SELECT published->\'identity\'->>\'name\' FROM "StoreAppearance";') != state['name']:
            raise StoreError('Identitas database tidak cocok dengan progres instalasi.')
    state['has_admin'] = True
    atomic_json(STATE, state)
    grant_runtime()
    (CONFIG / 'init.sql').write_text('-- Initialized; credentials live in root-only environment files.\n')
    dc(['up', '-d', '--wait', 'app'])
    healthy(state['local_test'])
    write_caddy(state, live=True)
    extra = ['--cacert', str(CONFIG / 'local-test-ca.crt')] if state['local_test'] else []
    for endpoint in ['/', '/login', '/api/v1/ready']:
        curl('https://' + state['domain'] + endpoint, extra)
    version = (ROOT / 'manager/VERSION').read_text().strip()
    atomic_json(CONFIG / 'version.json', {'version': version, 'source_sha': state['source_sha'], 'db_contract': 1,
                                       'migrations': inventory(ROOT)})
    for name in ['single-store-maintenance.service', 'single-store-maintenance.timer']:
        target = Path('/etc/systemd/system') / name
        target.write_bytes((ROOT / 'manager' / name).read_bytes())
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', '--now', 'single-store-maintenance.timer'])
    (CONFIG / 'installed').touch(mode=0o600)
    state.update(step=4, complete=True, setup_hash=None, busy=False, message='Toko berhasil dibuat. Konfigurasikan pembayaran dan pengiriman sebelum menerima pesanan.')
    atomic_json(STATE, state)
    (CONFIG / 'setup-token').unlink(missing_ok=True)
