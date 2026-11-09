"""Reviewed Hubify-only v1.3.0 upgrade; preserves volumes, credentials and old images."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time

sys.path.insert(0, '/opt/single-store/manager')
import core
import updater

MIGRATIONS = {
    '20261109090000_bank_account_lifecycle',
    '20261109100000_jnt_cancel_attempt_history',
    '20261109110000_customer_account_management',
}
JOURNAL = core.CONFIG / 'hubify-v130.json'


def counts(database='store'):
    query = '''SELECT json_build_object('products',(SELECT count(*) FROM "Product"),
'orders',(SELECT count(*) FROM "Order"),'payments',(SELECT count(*) FROM "Payment"),
'users',(SELECT count(*) FROM "User"),'images',(SELECT count(*) FROM "ProductImage"));'''
    return json.loads(core.dc(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], query.encode()))


def rehearse(backup, source):
    database = 'v130_rehearsal_' + secrets.token_hex(8)
    core.dc(['exec', '-T', 'db', 'createdb', '-U', 'postgres', database])
    try:
        with open(Path(backup) / 'database.dump', 'rb') as dump:
            result = subprocess.run(['docker', 'compose', '-f', str(core.COMPOSE), 'exec', '-T', 'db',
                'pg_restore', '-U', 'postgres', '-d', database, '--exit-on-error', '--no-owner'], stdin=dump, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Scratch restore failed')
        before = counts(database)
        sql = 'BEGIN;\n' + '\n'.join((source / 'app/prisma/migrations' / name / 'migration.sql').read_text() for name in sorted(MIGRATIONS)) + '\nCOMMIT;'
        core.dc(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], sql.encode())
        if counts(database) != before:
            raise RuntimeError('Migration altered business row counts')
        print('RESTORE_AND_MIGRATION_REHEARSAL_PASS', flush=True)
    finally:
        core.dc(['exec', '-T', 'db', 'dropdb', '-U', 'postgres', database])


def rollback(journal):
    core.atomic_json(core.COMPOSE, journal['old_compose'])
    core.dc(['up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'app'])
    core.healthy()
    # Keep successfully applied additive migration inventory; do not pretend schema was reverted.
    ledger = json.loads(core.sql('SELECT coalesce(json_object_agg(migration_name,checksum),\'{}\') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'))
    core.atomic_json(core.CONFIG / 'version.json', {**journal['previous'], 'migrations': ledger})
    core.run(['systemctl', 'start', 'single-store-maintenance.timer'])
    journal['status'] = 'code-rolled-back'
    core.atomic_json(JOURNAL, journal)
    print('OLD_CODE_RESTORED_DATA_PRESERVED', flush=True)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Authorized sudo operator required')
    if 'APP_ORIGIN=https://hubify.web.id' not in (core.CONFIG / 'runtime.env').read_text().splitlines():
        raise RuntimeError('Not Hubify')
    with open('/run/single-store-operation.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sys.argv[1:] == ['--rollback']:
            rollback(core.read_json(JOURNAL))
            return
        sha = sys.argv[1]
        if not re.fullmatch('[a-f0-9]{40}', sha):
            raise RuntimeError('Exact reviewed commit required')
        installed = core.read_json(core.CONFIG / 'version.json')
        if installed['version'] != '1.2.1':
            raise RuntimeError('Expected v1.2.1 baseline')
        source = core.ROOT / 'development-sources' / sha
        source.parent.mkdir(mode=0o700, exist_ok=True)
        if not source.exists():
            core.run(['git', 'clone', '--no-checkout', 'https://github.com/Assyauq26/buattokoonline.git', source], timeout=180)
        core.run(['git', '-C', source, 'fetch', 'origin', sha], timeout=180)
        core.run(['git', '-C', source, 'checkout', '--detach', sha])
        if core.run(['git', '-C', source, 'rev-parse', 'HEAD']) != sha or (source / 'VERSION').read_text().strip() != '1.3.0':
            raise RuntimeError('Release source mismatch')
        inventory = core.inventory(source)
        if set(inventory) - set(installed['migrations']) != MIGRATIONS or any(inventory.get(k) != v for k, v in installed['migrations'].items()):
            raise RuntimeError('Unreviewed migration changes')
        ledger = json.loads(core.sql('SELECT coalesce(json_object_agg(migration_name,checksum),\'{}\') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'))
        if ledger != installed['migrations'] or core.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;') != '0':
            raise RuntimeError('Migration ledger requires reconciliation')
        old = core.read_json(core.COMPOSE)
        candidate = copy.deepcopy(old)
        for name, target in [('app', 'runtime'), ('tools', 'tools')]:
            candidate['services'][name]['build'] = {'context': str(source / 'app'), 'target': target}
            candidate['services'][name]['image'] = 'single-store-' + name + ':v130-' + sha[:12]
        candidate['services']['app'].setdefault('environment', {}).update(STORE_INSTALLED_VERSION='1.3.0', STORE_BUILD_SHA=sha, STORE_UPDATE_CHANNEL='stable')
        stage = source / 'compose.v130.json'
        core.atomic_json(stage, candidate)
        backup = updater.backup()
        updater.verify_backup(backup)
        rehearse(backup, source)
        print('BUILDING_V130 ' + sha, flush=True)
        core.dc(['build', 'app', 'tools'], file=stage, timeout=2400)
        journal = {'status': 'prepared', 'sha': sha, 'previous': installed, 'old_compose': old, 'backup': backup, 'time': int(time.time())}
        core.atomic_json(JOURNAL, journal)
        try:
            core.run(['systemctl', 'stop', 'single-store-maintenance.timer', 'single-store-maintenance.service'])
            core.dc(['stop', 'app'])
            journal['backup'] = updater.backup()
            before = counts()
            journal['status'] = 'migrating'
            core.atomic_json(JOURNAL, journal)
            core.dc(['run', '--rm', '-T', 'tools', 'npm', 'run', 'db:migrate'], file=stage)
            core.grant_runtime()
            if counts() != before:
                raise RuntimeError('Business row counts changed')
            core.atomic_json(core.COMPOSE, candidate)
            core.dc(['up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'app'])
            core.healthy()
            core.public_health(core.read_json(core.STATE))
            core.atomic_json(core.CONFIG / 'version.json', {**installed, 'version': '1.3.0', 'source_sha': sha, 'channel': 'stable', 'migrations': inventory})
            core.run(['systemctl', 'start', 'single-store-maintenance.timer'])
            journal.update(status='complete', counts=before)
            core.atomic_json(JOURNAL, journal)
            print('HUBIFY_V130_SUCCESS ' + sha + ' backup=' + journal['backup'], flush=True)
        except Exception:
            rollback(journal)
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Upgrade stopped: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
