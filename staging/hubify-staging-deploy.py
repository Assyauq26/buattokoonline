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


def verify_candidate(pr_number, sha):
    if not re.fullmatch(r'[1-9][0-9]{0,8}', pr_number) or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise core.StoreError('Diperlukan nomor PR dan SHA 40 karakter yang tepat.')
    repo = github('')
    if repo['id'] != core.REPO_ID or repo['full_name'] != REPOSITORY:
        raise core.StoreError('Identitas repository tidak cocok.')
    pr = github('pulls/' + pr_number)
    if (pr['state'] != 'open' or pr['head']['sha'] != sha or
            pr['head']['repo']['full_name'] != REPOSITORY or
            pr['base']['repo']['full_name'] != REPOSITORY or
            pr['base']['ref'] != 'main'):
        raise core.StoreError('SHA bukan HEAD PR internal terbuka yang menuju main.')
    runs = github('actions/workflows/verify.yml/runs?event=pull_request&head_sha=' + sha + '&per_page=50')
    passed = any(r['head_sha'] == sha and r['conclusion'] == 'success' and
                 r['head_branch'] == pr['head']['ref'] for r in runs['workflow_runs'])
    if not passed:
        raise core.StoreError('CI verify.yml belum SUCCESS untuk exact SHA ini.')
    return pr


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
    candidate = core.inventory(source)
    existing = installed['migrations']
    for name, digest in existing.items():
        if candidate.get(name) != digest:
            raise core.StoreError('Migrasi existing berubah atau hilang: ' + name)
    for name in sorted(set(candidate) - set(existing)):
        if not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name) or name <= max(existing, default=''):
            raise core.StoreError('Urutan migrasi baru tidak kompatibel.')
        updater.validate_additive((source / 'app/prisma/migrations' / name / 'migration.sql').read_text())
    version = (source / 'VERSION').read_text().strip()
    if updater.version_tuple(version) < updater.version_tuple(installed['version']):
        raise core.StoreError('Versi kandidat lebih lama dari versi terpasang.')
    return candidate, version


def prepare_source(pr_number, sha):
    root = core.ROOT / 'staging-sources'
    root.mkdir(mode=0o700, exist_ok=True)
    source = Path(tempfile.mkdtemp(prefix='pr' + pr_number + '-' + sha[:12] + '-', dir=root))
    core.run(['git', 'init', '-q', str(source)])
    core.run(['git', '-C', source, 'remote', 'add', 'origin', 'https://github.com/' + REPOSITORY + '.git'])
    core.run(['git', '-C', source, 'fetch', '--depth=1', 'origin', 'refs/pull/' + pr_number + '/head'], timeout=180)
    core.run(['git', '-C', source, 'checkout', '-q', '--detach', 'FETCH_HEAD'])
    actual = core.run(['git', '-C', source, 'rev-parse', 'HEAD'])
    if actual != sha:
        raise core.StoreError('Commit fetch berbeda dengan SHA yang disetujui.')
    return source


def assert_db_inventory(installed):
    rows = json.loads(core.sql(
        """SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum)),'[]')
           FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"""))
    if {row['name']: row['checksum'] for row in rows} != installed['migrations']:
        raise core.StoreError('Riwayat migrasi database berbeda dari metadata instalasi.')
    if core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;') != '0':
        raise core.StoreError('Terdapat migrasi gagal atau belum selesai.')


def deploy(pr_number, sha):
    state, installed = preflight()
    verify_candidate(pr_number, sha)
    source = prepare_source(pr_number, sha)
    inventory, candidate_version = check_schema(source, installed)
    assert_db_inventory(installed)
    compose = source / 'compose.json'
    core.atomic_json(compose, core.compose_for(source, 'hubify-' + sha[:12]))
    previous_manager = source / 'previous-manager'
    shutil.copytree(core.ROOT / 'manager', previous_manager, ignore=shutil.ignore_patterns('__pycache__'))
    journal = {
        'status': 'updating', 'staging': True,
        'old_compose': core.read_json(core.COMPOSE), 'from': installed,
        'to': sha, 'backup': None, 'manager_backup': str(previous_manager),
        'pr_number': int(pr_number)}
    core.atomic_json(JOURNAL, journal)
    print('Staging PR #' + pr_number + ' @ ' + sha + ' — backup dan deployment dimulai.', flush=True)
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
            'pr_number': int(pr_number), 'sha': sha,
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
            updater.recover(journal)
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
    updater.recover(journal)
    print('Rollback kode selesai. Migrasi additive tidak diturunkan.')


def main():
    os.umask(0o077)
    args = sys.argv[1:]
    if args != ['--rollback'] and len(args) != 2:
        raise core.StoreError('Gunakan: hubify-staging-deploy PR_NUMBER SHA_40_HEX | --rollback')
    with open('/run/single-store-operation.lock', 'a+') as file:
        fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args == ['--rollback']:
            rollback()
        else:
            deploy(*args)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, core.StoreError) else
              'Deploy staging berhenti; baca journal lokal root-only.', file=sys.stderr)
        raise SystemExit(1)
