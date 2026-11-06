#!/usr/bin/env python3
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import urllib.error
import core

API = 'https://api.github.com/repos/' + core.REPO
JOURNAL = core.CONFIG / 'update.json'
BACKUPS = Path('/var/backups/single-store')


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


class GitHubRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname not in ['github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'] or parsed.username or parsed.password:
            raise core.StoreError('Redirect paket bukan host resmi GitHub.')
        return super().redirect_request(req, fp, code, msg, headers, url)


def get(url):
    request = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'single-store-updater', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.build_opener(urllib.request.ProxyHandler({}), GitHubRedirects()).open(request, timeout=30) as response:
        data = response.read(5 * 1024 * 1024 + 1)
        if len(data) > 5 * 1024 * 1024:
            raise core.StoreError('Metadata release terlalu besar.')
        return json.loads(data)


def version_tuple(version):
    if not isinstance(version, str) or not re.fullmatch(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', version):
        raise core.StoreError('Gunakan versi stabil, misalnya 1.0.1.')
    return tuple(map(int, version.split('.')))


def official_release(version=None):
    identity = get(API)
    if identity['id'] != core.REPO_ID or identity['full_name'].lower() != core.REPO.lower():
        raise core.StoreError('Identitas repository tidak cocok.')
    if version:
        version_tuple(version)
    try:
        release = get(API + ('/releases/tags/v' + version if version else '/releases/latest'))
    except urllib.error.HTTPError as error:
        if error.code == 404 and not version:
            return None
        if error.code == 404:
            raise core.StoreError('GitHub Release stabil untuk versi tersebut belum tersedia.')
        raise
    if release.get('draft') or release.get('prerelease') or not release['tag_name'].startswith('v'):
        raise core.StoreError('Hanya GitHub Release stabil yang diizinkan.')
    version = release['tag_name'][1:]
    version_tuple(version)
    if release['html_url'] != 'https://github.com/' + core.REPO + '/releases/tag/v' + version:
        raise core.StoreError('URL release tidak cocok.')
    reference = get(API + '/git/ref/tags/v' + version)['object']
    for _ in range(5):
        if reference['type'] == 'commit':
            break
        if reference['type'] != 'tag':
            raise core.StoreError('Tag release tidak valid.')
        reference = get(API + '/git/tags/' + reference['sha'])['object']
    if reference['type'] != 'commit' or not re.fullmatch(r'[0-9a-f]{40}', reference['sha']):
        raise core.StoreError('Commit release tidak dapat diverifikasi.')
    assets = [asset for asset in release['assets'] if asset['name'] == 'store-v' + version + '.tar.gz']
    if len(assets) != 1 or not re.fullmatch(r'sha256:[0-9a-f]{64}', assets[0].get('digest') or ''):
        raise core.StoreError('Paket resmi dengan digest SHA256 dari GitHub belum tersedia.')
    asset = assets[0]
    expected_url = 'https://github.com/' + core.REPO + '/releases/download/v' + version + '/' + asset['name']
    if asset['browser_download_url'] != expected_url or not 0 < asset['size'] <= 300 * 1024 * 1024:
        raise core.StoreError('Identitas/ukuran asset tidak valid.')
    return {'version': version, 'sha': reference['sha'], 'digest': asset['digest'][7:], 'url': expected_url,
            'notes': release.get('body') or '', 'release_id': release['id'], 'asset_id': asset['id']}


def validate_additive(sql):
    """Deliberately small grammar. Unrecognized migrations require manual operator review."""
    sql = re.sub(r'--[^\n]*', '', sql).strip()
    if any(token in sql for token in ['/*', '*/', '$', "'", '\\']):
        raise core.StoreError('Migrasi membutuhkan review operator: grammar otomatis terbatas.')
    ident = r'"[A-Za-z][A-Za-z0-9_]{0,62}"'
    kind = r'(?:TEXT|INTEGER|BIGINT|BOOLEAN|UUID|JSONB|TIMESTAMP(?:\([0-6]\))?(?: WITHOUT TIME ZONE)?)'
    column = ident + r'\s+' + kind + r'(?:\s+NOT NULL)?(?:\s+PRIMARY KEY)?'
    statements = [s.strip() for s in sql.split(';') if s.strip()]
    if not statements:
        raise core.StoreError('Migrasi kosong tidak diterima.')
    for statement in statements:
        allowed = [r'CREATE TABLE ' + ident + r'\s*\(\s*' + column + r'(?:\s*,\s*' + column + r')*\s*\)',
                   r'CREATE INDEX ' + ident + r' ON ' + ident + r'\s*\(\s*' + ident + r'(?:\s*,\s*' + ident + r')*\s*\)',
                   r'ALTER TABLE ' + ident + r' ADD COLUMN ' + ident + r'\s+' + kind]
        if not any(re.fullmatch(pattern, statement, re.I) for pattern in allowed):
            raise core.StoreError('Migrasi tidak terbukti additive/kompatibel. Hentikan; operator harus merencanakan migrasi dan recovery secara manual.')


def safe_members(archive):
    seen, total = set(), 0
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if not member.isfile() or path.is_absolute() or '..' in path.parts or path.as_posix() != member.name or '\\' in member.name or ':' in member.name or member.name in seen or not member.name or len(member.name) > 300:
            raise core.StoreError('Paket berisi path, link, atau entri tidak aman.')
        total += member.size
        if len(seen) >= 10000 or total > 500 * 1024 * 1024:
            raise core.StoreError('Paket melampaui batas ekstraksi.')
        seen.add(member.name)
    return seen


def extract_package(package, destination, release, installed):
    with tarfile.open(package, 'r:gz') as archive:
        names = safe_members(archive)
        required = {'VERSION', 'app/Dockerfile', 'app/package-lock.json', 'deploy/compose.yaml', 'installer/core.py', 'installer/updater.py', 'update.sh', 'restore.sh'}
        if not required <= names or archive.getmember('release.json').size > 2 * 1024 * 1024:
            raise core.StoreError('Paket aplikasi tidak lengkap.')
        manifest = json.load(archive.extractfile('release.json'))
        if manifest.get('format') != 1 or manifest.get('repository') != core.REPO or manifest.get('repository_id') != core.REPO_ID or manifest.get('version') != release['version'] or manifest.get('tag') != 'v' + release['version'] or manifest.get('source_sha') != release['sha']:
            raise core.StoreError('Manifest, tag, repository atau commit paket tidak cocok.')
        if names != set(manifest['files']) | {'release.json'}:
            raise core.StoreError('Daftar isi paket tidak cocok dengan manifest.')
        policy = manifest['compatibility']
        if policy.get('postgres_major') != 16 or policy.get('db_contract') != installed['db_contract'] or not policy.get('minimum_installed_contract', 999) <= installed['db_contract'] <= policy.get('maximum_installed_contract', -1) or policy.get('rollback_compatible') is not True:
            raise core.StoreError('Kontrak database/rollback tidak kompatibel. Tindakan operator diperlukan.')
        migrations = manifest['migrations']
        for name, digest in installed['migrations'].items():
            if migrations.get(name) != digest:
                raise core.StoreError('Riwayat migrasi existing berubah atau hilang.')
        for name in sorted(set(migrations) - set(installed['migrations'])):
            if name <= max(installed['migrations'], default='') or not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name):
                raise core.StoreError('Urutan migrasi baru tidak valid.')
            member = 'app/prisma/migrations/' + name + '/migration.sql'
            validate_additive(archive.extractfile(member).read().decode())
        for name, digest in manifest['files'].items():
            data = archive.extractfile(name).read()
            if hashlib.sha256(data).hexdigest() != digest:
                raise core.StoreError('Checksum isi paket tidak cocok.')
            path = destination / name
            path.parent.mkdir(parents=True, exist_ok=True)
            for parent in [path.parent, *path.parent.parents]:
                if parent == destination:
                    break
                parent.chmod(0o755)
            path.write_bytes(data)
            path.chmod(0o644)
    if core.inventory(destination) != manifest['migrations']:
        raise core.StoreError('Inventory migrasi tidak cocok.')
    return manifest


def backup():
    BACKUPS.mkdir(mode=0o700, exist_ok=True)
    estimate = int(core.sql("SELECT pg_database_size('store');"))
    estimate += sum(p.stat().st_size for root in [core.DATA / 'media', core.CONFIG] for p in root.rglob('*') if p.is_file())
    if shutil.disk_usage(BACKUPS).free < 2 * estimate + 2 * 1024**3:
        raise core.StoreError('Ruang backup/build tidak cukup; data existing dipertahankan.')
    path = BACKUPS / (time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + secrets.token_hex(4))
    path.mkdir(mode=0o700)
    with open(path / 'database.dump', 'wb') as file:
        result = subprocess.run(['docker', 'compose', '-f', str(core.COMPOSE), 'exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-d', 'store', '-Fc'], stdout=file, stderr=subprocess.PIPE)
        if result.returncode:
            raise core.StoreError('Backup database gagal; aktivasi dibatalkan.')
    for name, source, arcname in [('media.tar.gz', core.DATA / 'media', 'media'), ('configuration.tar.gz', core.CONFIG, 'configuration')]:
        with tarfile.open(path / name, 'w:gz') as archive:
            archive.add(source, arcname=arcname)
    core.atomic_json(path / 'backup.json', {'version': core.read_json(core.CONFIG / 'version.json'), 'files': {name: sha256(path / name) for name in ['database.dump', 'media.tar.gz', 'configuration.tar.gz']}})
    return str(path)


def verify_backup(path):
    path = Path(path).resolve(strict=True)
    if path.parent != BACKUPS.resolve() or path.is_symlink():
        raise core.StoreError('Gunakan direktori backup lokal toko ini.')
    manifest = core.read_json(path / 'backup.json')
    if set(manifest['files']) != {'database.dump', 'media.tar.gz', 'configuration.tar.gz'}:
        raise core.StoreError('Manifest backup tidak valid.')
    for name, digest in manifest['files'].items():
        if sha256(path / name) != digest:
            raise core.StoreError('Checksum backup gagal.')
    database = 'restore_check_' + secrets.token_hex(8)
    core.run(['docker', 'compose', '-f', core.COMPOSE, 'exec', '-T', 'db', 'createdb', '-U', 'postgres', database])
    try:
        with open(path / 'database.dump', 'rb') as file:
            result = subprocess.run(['docker', 'compose', '-f', str(core.COMPOSE), 'exec', '-T', 'db', 'pg_restore', '-U', 'postgres', '-d', database, '--exit-on-error', '--no-owner'], stdin=file, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode:
                raise core.StoreError('Restore ke database pemeriksaan gagal.')
        result = core.run(['docker', 'compose', '-f', core.COMPOSE, 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', database, '-At', '-c', 'SELECT json_build_object(\'products\',(SELECT count(*) FROM "Product"),\'users\',(SELECT count(*) FROM "User"),\'identities\',(SELECT count(*) FROM "StoreAppearance"));'])
        with tempfile.TemporaryDirectory(prefix='store-restore-') as temp:
            for name in ['media.tar.gz', 'configuration.tar.gz']:
                with tarfile.open(path / name) as archive:
                    for member in archive.getmembers():
                        if not (member.isfile() or member.isdir()) or PurePosixPath(member.name).is_absolute() or '..' in PurePosixPath(member.name).parts or '\\' in member.name:
                            raise core.StoreError('Archive backup berisi entri tidak aman.')
                    archive.extractall(temp, filter='data')
            if not (Path(temp) / 'configuration/runtime.env').is_file() or not (Path(temp) / 'media').is_dir():
                raise core.StoreError('Media/configuration backup tidak lengkap.')
            media_count = len([p for p in (Path(temp) / 'media').rglob('*') if p.is_file()])
            runtime_digest = sha256(Path(temp) / 'configuration/runtime.env')
        print(json.dumps({'restored_to_scratch_database': True, 'media_configuration_extracted': True, 'media_count': media_count, 'configuration_runtime_sha256': runtime_digest, 'counts': json.loads(result)}))
    finally:
        core.run(['docker', 'compose', '-f', core.COMPOSE, 'exec', '-T', 'db', 'dropdb', '-U', 'postgres', database])


def recover(journal):
    if journal.get('status') not in ['updating', 'failed']:
        return
    core.atomic_json(core.COMPOSE, journal['old_compose'])
    core.dc(['up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'app'])
    core.healthy()
    core.write_caddy(core.read_json(core.STATE), live=True)
    core.public_health(core.read_json(core.STATE))
    core.atomic_json(core.CONFIG / 'version.json', journal['from'])
    shutil.copytree(journal['manager_backup'], core.ROOT / 'manager', dirs_exist_ok=True)
    core.run(['systemctl', 'start', 'single-store-maintenance.timer'])
    journal['status'] = 'code_rolled_back'
    core.atomic_json(JOURNAL, journal)
    print('Kode/container lama dipulihkan. Migrasi additive yang sudah diterapkan tetap di database; tidak ada klaim rollback skema. Backup: ' + journal.get('backup', 'belum dibuat'))


def installed_version():
    path = core.CONFIG / 'version.json'
    if path.exists():
        return core.read_json(path)
    raise core.StoreError('Metadata versi belum tersedia. Lihat panduan adopsi instalasi lama; database tidak diinisialisasi ulang.')


def apply_release(release, package, installed):
    target = core.ROOT / 'releases' / (release['version'] + '-' + release['sha'][:12] + '-' + secrets.token_hex(3))
    target.mkdir(parents=True, mode=0o700)
    manifest = extract_package(package, target, release, installed)
    pending = json.loads(core.sql('SELECT coalesce(json_agg(json_build_object(\'name\',migration_name,\'checksum\',checksum)),\'[]\') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'))
    if {row['name']: row['checksum'] for row in pending} != installed['migrations']:
        raise core.StoreError('Riwayat database berbeda dengan versi terpasang; review operator diperlukan.')
    unfinished = core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')
    if unfinished != '0':
        raise core.StoreError('Ada migrasi gagal/terputus. Operator harus merekonsiliasi Prisma sebelum update.')
    stage = target / 'compose.json'
    core.atomic_json(stage, core.compose_for(target, release['version'] + '-' + release['sha'][:12]))
    manager_backup = target / 'previous-manager'
    shutil.copytree(core.ROOT / 'manager', manager_backup, ignore=shutil.ignore_patterns('__pycache__'))
    journal = {'status': 'updating', 'old_compose': core.read_json(core.COMPOSE), 'from': installed, 'to': release['version'], 'backup': None, 'manager_backup': str(manager_backup)}
    core.atomic_json(JOURNAL, journal)
    try:
        core.write_caddy(core.read_json(core.STATE), live=False)
        core.run(['systemctl', 'stop', 'single-store-maintenance.timer', 'single-store-maintenance.service'])
        core.dc(['stop', 'app'])
        journal['backup'] = backup()
        core.atomic_json(JOURNAL, journal)
        core.dc(['build', 'app', 'tools'], file=stage, timeout=1800)
        core.dc(['run', '--rm', '-T', 'tools', 'npm', 'run', 'db:migrate'], file=stage)
        core.grant_runtime()
        core.atomic_json(core.COMPOSE, core.read_json(stage))
        core.dc(['up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'app'])
        core.healthy()
        core.write_caddy(core.read_json(core.STATE), live=True)
        core.public_health(core.read_json(core.STATE))
        # New manager code becomes available only after the new application is healthy.
        shutil.copytree(target / 'installer', core.ROOT / 'manager', dirs_exist_ok=True)
        for name in ['VERSION', 'update.sh', 'restore.sh']:
            shutil.copy2(target / name, core.ROOT / 'manager' / name)
        shutil.copy2(target / 'deploy/compose.yaml', core.ROOT / 'manager/compose-base.json')
        core.atomic_json(core.CONFIG / 'version.json', {'version': manifest['version'], 'source_sha': manifest['source_sha'], 'db_contract': manifest['compatibility']['db_contract'], 'migrations': manifest['migrations']})
        journal['status'] = 'complete'
        core.atomic_json(JOURNAL, journal)
        core.run(['systemctl', 'start', 'single-store-maintenance.timer'])
        print('Update berhasil: ' + manifest['version'] + '. Backup: ' + journal['backup'])
    except Exception:
        journal['status'] = 'failed'
        core.atomic_json(JOURNAL, journal)
        try:
            recover(journal)
        except Exception:
            raise core.StoreError('Pemulihan kode belum sehat. Jalankan update.sh --recover; pertahankan backup dan minta review operator.')
        raise core.StoreError('Aktivasi gagal; kode lama dipulihkan. Review migrasi additive sebelum mencoba update lagi.')


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--version')
    parser.add_argument('--recover', action='store_true')
    parser.add_argument('--verify-backup')
    parser.add_argument('--fixture', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if os.geteuid() != 0 or not (core.CONFIG / 'installed').exists():
        raise core.StoreError('Updater hanya untuk instalasi toko yang sudah selesai, dijalankan sebagai root.')
    if args.verify_backup:
        return verify_backup(args.verify_backup)
    if args.recover:
        return recover(core.read_json(JOURNAL))
    if JOURNAL.exists() and core.read_json(JOURNAL)['status'] in ['updating', 'failed']:
        raise core.StoreError('Update terputus. Jalankan --recover sebelum memeriksa versi baru.')
    installed = installed_version()
    if installed.get('channel') == 'hubify-development':
        raise core.StoreError('Hubify memakai jalur deployment operator, bukan updater rilis stabil.')
    print('Versi terpasang: ' + installed['version'])
    fixture = None
    if args.fixture:
        if os.environ.get('GITHUB_ACTIONS') != 'true' or not core.read_json(core.STATE).get('local_test'):
            raise core.StoreError('Fixture hanya di VM CI dengan instalasi LOCAL_TEST; tidak tersedia pada produksi.')
        fixture = core.read_json(args.fixture)
        release = fixture['release']
    else:
        release = official_release(args.version)
    if release is None:
        print('Belum ada GitHub Release stabil yang tersedia.')
        return
    print('Release tersedia: ' + release['version'])
    print(re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', release['notes'])[:20000])
    if version_tuple(release['version']) <= version_tuple(installed['version']):
        print('Tidak ada versi lebih baru.')
        return
    if not args.apply:
        print('Gunakan --apply untuk verifikasi kompatibilitas, backup dan update manual.')
        return
    with tempfile.TemporaryDirectory(prefix='store-release-') as directory:
        package = Path(directory) / 'package.tar.gz'
        if fixture:
            shutil.copyfile(fixture['package'], package)
        else:
            request = urllib.request.Request(release['url'], headers={'User-Agent': 'single-store-updater'})
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), GitHubRedirects()).open(request, timeout=60) as response, open(package, 'wb') as file:
                total = 0
                for chunk in iter(lambda: response.read(1024 * 1024), b''):
                    total += len(chunk)
                    if total > 300 * 1024 * 1024:
                        raise core.StoreError('Ukuran paket melebihi batas.')
                    file.write(chunk)
        if sha256(package) != release['digest']:
            raise core.StoreError('Digest paket tidak cocok dengan metadata asset GitHub.')
        # Review compatibility before consent/downtime; extraction never executes package code.
        preview = Path(directory) / 'preview'
        preview.mkdir()
        extract_package(package, preview, release, installed)
        print('Identitas, digest, tag SHA dan kompatibilitas terverifikasi. Toko akan berhenti sementara selama backup/build/aktivasi.')
        if input('Ketik UPDATE v' + release['version'] + ': ') != 'UPDATE v' + release['version']:
            raise core.StoreError('Update dibatalkan.')
        apply_release(release, package, installed)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, core.StoreError) else 'Updater berhenti. Pertahankan data dan backup; periksa status layanan lokal.', file=sys.stderr)
        raise SystemExit(1)
