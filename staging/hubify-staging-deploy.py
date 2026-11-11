#!/usr/bin/env python3
"""Root-owned, Hubify-only staging deployment helper. Install from reviewed main."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time
import urllib.request

MANAGER = Path('/opt/single-store/manager')
if MANAGER.is_dir():
    sys.path.insert(0, str(MANAGER))
else:  # Test-only import path; production uses the installed trusted manager.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'installer'))
import core
import updater

REPOSITORY = 'Assyauq26/buattokoonline'
HOST = 'hubify.web.id'
JOURNAL = core.CONFIG / 'update.json'
STAGING_STATE = core.CONFIG / 'hubify-staging.json'
# Shipping settings only add schema and copy legacy integration data in one transaction.
REVIEWED_MIGRATIONS = {
    '20261105100000_shipping_settings': '4e0da4c8ce33d4dcffb3ca1a51c776c3a3551ddeb257519beb33120cc26e631e',
}


def github(path):
    url = 'https://api.github.com/repos/' + REPOSITORY + ('/' + path if path else '')
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'hubify-staging-deployer',
        'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=30) as response:
        data = response.read(3 * 1024 * 1024 + 1)
    if len(data) > 3 * 1024 * 1024:
        raise core.StoreError('Respons GitHub terlalu besar.')
    return json.loads(data)


def verify_repository():
    repo = github('')
    if repo['id'] != core.REPO_ID or repo['full_name'] != REPOSITORY:
        raise core.StoreError('Identitas repository tidak cocok.')


def preflight():
    if os.geteuid() != 0 or not (core.CONFIG / 'installed').is_file():
        raise core.StoreError('Hanya instalasi Hubify yang sudah selesai, sebagai root.')
    state = core.read_json(core.STATE)
    if state.get('domain') != HOST or state.get('local_test') or not state.get('complete'):
        raise core.StoreError('Domain atau mode instalasi bukan staging Hubify.')
    env_lines = (core.CONFIG / 'runtime.env').read_text().splitlines()
    if 'APP_ORIGIN=https://' + HOST not in env_lines:
        raise core.StoreError('APP_ORIGIN bukan Hubify.')
    for name in ('JNT_PRODUCTION_ORDER_APPROVED', 'JNT_PRODUCTION_API_APPROVED'):
        if name + '=yes' in env_lines:
            raise core.StoreError('J&T Production tidak boleh diaktifkan di staging.')
    if JOURNAL.exists() and core.read_json(JOURNAL).get('status') in ('updating', 'failed'):
        raise core.StoreError('Update sebelumnya belum dipulihkan. Periksa journal sebelum melanjutkan.')
    return state, core.read_json(core.CONFIG / 'version.json')


def check_schema(source, installed):
    policy = core.read_json(source / 'release-policy.json')
    if (policy.get('postgres_major') != 16 or
            policy.get('db_contract') != installed['db_contract'] or
            policy.get('rollback_compatible') is not True):
        raise core.StoreError('Kontrak database atau rollback tidak kompatibel.')
    from historical_migrations import validate_source
    candidate, compatibility = validate_source(source, installed)
    for record in compatibility:
        print('HISTORICAL_MIGRATION_COMPATIBILITY ' + json.dumps(record, sort_keys=True), flush=True)
    existing = installed['migrations']
    for name in sorted(set(candidate) - set(existing)):
        if not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name) or name <= max(existing, default=''):
            raise core.StoreError('Urutan migrasi baru tidak kompatibel.')
        if name in REVIEWED_MIGRATIONS:
            if candidate[name] != REVIEWED_MIGRATIONS[name]:
                raise core.StoreError('Checksum migrasi Hubify yang ditinjau berubah: ' + name)
        else:
            updater.validate_additive((source / 'app/prisma/migrations' / name / 'migration.sql').read_text())
    version = (source / 'VERSION').read_text().strip()
    if updater.version_tuple(version) < updater.version_tuple(installed['version']):
        raise core.StoreError('Versi kandidat lebih lama dari versi terpasang.')
    return candidate, version


def prepare_source(sha):
    root = core.ROOT / 'staging-sources'
    root.mkdir(mode=0o700, exist_ok=True)
    source = Path(tempfile.mkdtemp(prefix='main-' + sha[:12] + '-', dir=root))
    core.run(['git', 'init', '-q', str(source)])
    core.run(['git', '-C', source, 'remote', 'add', 'origin', 'https://github.com/' + REPOSITORY + '.git'])
    core.run(['git', '-C', source, 'fetch', '--depth=1', 'origin', 'refs/heads/main'], timeout=180)
    actual = core.run(['git', '-C', source, 'rev-parse', 'FETCH_HEAD'])
    if actual != sha:
        raise core.StoreError('SHA bukan HEAD main terkini. Jalankan ulang deploy dari main.')
    core.run(['git', '-C', source, 'checkout', '-q', '--detach', sha])
    return source


def read_db_inventory():
    rows = json.loads(core.sql(
        """SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum)),'[]')
           FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"""))
    if core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;') != '0':
        raise core.StoreError('Terdapat migrasi gagal atau belum selesai.')
    if len(rows) != len({row['name'] for row in rows}):
        raise core.StoreError('Duplikat riwayat migrasi tidak diizinkan.')
    return {row['name']: row['checksum'] for row in rows}


def recover_code(journal, approved_inventory):
    updater.recover(journal)
    actual = read_db_inventory()
    if (any(actual.get(name) != digest for name, digest in journal['from']['migrations'].items())
            or any(approved_inventory.get(name) != digest for name, digest in actual.items())):
        raise core.StoreError('Riwayat migrasi setelah pemulihan perlu diperiksa operator.')
    # Recover rolls back the application, while approved migrations may remain applied.
    core.atomic_json(core.CONFIG / 'version.json', {**journal['from'], 'migrations': actual})


def deploy(sha):
    state, installed = preflight()
    verify_repository()
    if installed.get('source_sha') == sha:
        active = Path(core.read_json(core.COMPOSE)['services']['app']['build']['context']).parent
        check_schema(active, installed)
        core.healthy()
        core.public_health(state)
        print('STAGING_ALREADY_DEPLOYED: https://' + HOST + '/ @ ' + sha, flush=True)
        return
    source = prepare_source(sha)
    inventory, candidate_version = check_schema(source, installed)
    if read_db_inventory() != installed['migrations']:
        raise core.StoreError('Riwayat migrasi database berbeda dari metadata instalasi.')
    if installed.get('source_sha') == sha:
        core.healthy()
        core.public_health(state)
        print('STAGING_ALREADY_DEPLOYED: https://' + HOST + '/ @ ' + sha, flush=True)
        return
    from historical_migrations import prepare_runtime_projection
    for record in prepare_runtime_projection(source, installed):
        print('HISTORICAL_RUNTIME_PROJECTION ' + json.dumps(record, sort_keys=True), flush=True)
    compose = source / 'compose.json'
    core.atomic_json(compose, core.compose_for(source, 'hubify-' + sha[:12]))
    previous_manager = source / 'previous-manager'
    shutil.copytree(core.ROOT / 'manager', previous_manager, ignore=shutil.ignore_patterns('__pycache__'))
    journal = {
        'status': 'updating', 'staging': True,
        'old_compose': core.read_json(core.COMPOSE), 'from': installed,
        'to': sha, 'backup': 'belum dibuat', 'manager_backup': str(previous_manager),
        'branch': 'main'}
    core.atomic_json(JOURNAL, journal)
    print('Staging main @ ' + sha + ' — backup dan deployment dimulai.', flush=True)
    try:
        core.write_caddy(state, live=False)
        core.run(['systemctl', 'stop', 'single-store-maintenance.timer', 'single-store-maintenance.service'])
        core.dc(['stop', 'app'])
        journal['backup'] = updater.backup()
        core.atomic_json(JOURNAL, journal)
        print('Backup selesai; build profil 2GB dimulai.', flush=True)
        core.dc(['build', 'app', 'tools'], file=compose, timeout=1800)
        print('Build selesai; migrasi kompatibel dimulai.', flush=True)
        core.dc(['run', '--rm', '-T', 'tools', 'npm', 'run', 'db:migrate'], file=compose, timeout=300)
        core.grant_runtime()
        core.atomic_json(core.COMPOSE, core.read_json(compose))
        core.dc(['up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'app'], timeout=180)
        core.healthy()
        core.write_caddy(state, live=True)
        core.public_health(state)
        core.atomic_json(core.CONFIG / 'version.json', {
            **installed, 'source_sha': sha, 'migrations': inventory,
            'channel': 'hubify-staging', 'candidate_version': candidate_version})
        core.atomic_json(STAGING_STATE, {
            'branch': 'main', 'sha': sha,
            'candidate_version': candidate_version, 'deployed_at': int(time.time()),
            'backup_path': journal['backup']})
        journal['status'] = 'complete'
        core.atomic_json(JOURNAL, journal)
        core.run(['systemctl', 'start', 'single-store-maintenance.timer'])
        print('STAGING_DEPLOY_SUCCESS: https://' + HOST + '/ @ ' + sha, flush=True)
    except Exception:
        journal['status'] = 'failed'
        core.atomic_json(JOURNAL, journal)
        try:
            recover_code(journal, inventory)
        except Exception as error:
            raise core.StoreError(
                'Recovery otomatis belum sehat. Pertahankan backup/journal dan minta review operator.') from error
        raise core.StoreError('Deploy gagal; kode/container lama dipulihkan. Migrasi additive tetap ada.')


def rollback():
    preflight()
    journal = core.read_json(JOURNAL)
    current = core.read_json(core.CONFIG / 'version.json')
    if (not journal.get('staging') or journal.get('status') != 'complete' or
            current.get('source_sha') != journal.get('to')):
        raise core.StoreError('Rollback hanya untuk deployment staging terakhir.')
    journal['status'] = 'failed'
    core.atomic_json(JOURNAL, journal)
    state = core.read_json(core.STATE)
    core.write_caddy(state, live=False)
    core.run(['systemctl', 'stop', 'single-store-maintenance.timer', 'single-store-maintenance.service'])
    core.dc(['stop', 'app'])
    recover_code(journal, current['migrations'])
    print('Rollback kode selesai. Migrasi database tetap tercatat.')


def main():
    os.umask(0o077)
    args = sys.argv[1:]
    if args != ['--rollback'] and (len(args) != 1 or not re.fullmatch(r'[0-9a-f]{40}', args[0])):
        raise core.StoreError('Gunakan: hubify-staging-deploy MAIN_SHA_40_HEX | --rollback')
    with open('/run/single-store-operation.lock', 'a+') as file:
        fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args == ['--rollback']:
            rollback()
        else:
            deploy(args[0])


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, core.StoreError) else
              'Deploy staging berhenti; baca journal lokal root-only.', file=sys.stderr)
        raise SystemExit(1)
