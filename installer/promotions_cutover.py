"""Operator-only, single-installation v1.8.0 cutover. Never a generic updater exception.

The staging and generic updater guards remain intact. This executor requires the
exact reviewed Hubify baseline, canonical package, main SHA, full backup and a
write fence. Production carrier approval flags are preserved, never disabled.
No restore, migration resolution, shipment request or historical SQL write exists.
"""
import copy
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time
import urllib.request

import core
import updater
import promotions_transition as transition

TARGET_TREE = '7b8ddfe64c35c981da0aed5804135ea719e2f714'
PROXY_HASHES = {
    'live': 'd9bcf3dffdf41abfb3500f9f3b0f002ff175fb8b742639a4539569610e6e7852',
    'maintenance': 'fad40745569a46024700b1bab66043fb5b15aabf15f003a5324c22c63dbb4023',
}
FLAGS = ('JNT_PRODUCTION_API_APPROVED', 'JNT_PRODUCTION_ORDER_APPROVED', 'JNT_ENABLE_ORDER_CREATE')


def check(condition, reason):
    if not condition:
        raise core.StoreError('CUTOVER_REJECTED: ' + reason)


@contextmanager
def operation_lock(path='/run/single-store-operation.lock'):
    import fcntl
    with open(path, 'a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise core.StoreError('CUTOVER_REJECTED: operation lock busy') from None
        yield


def verify_git_package(repository, sha, manifest, files):
    def read_git(*args):
        result = subprocess.run(['git', '-C', str(repository), *args], capture_output=True, text=True)
        check(result.returncode == 0, 'Git source verification')
        return result.stdout.strip()
    check(read_git('rev-parse', 'HEAD') == sha, 'executor source SHA')
    check(read_git('rev-parse', 'HEAD:app') == TARGET_TREE, 'reviewed application tree')
    read_git('diff', '--exit-code', 'HEAD')
    raw = subprocess.check_output(['git', '-C', str(repository), 'ls-tree', '-rz', '--full-tree', sha])
    objects = {}
    for record in raw.split(b'\0'):
        if record:
            header, name = record.split(b'\t', 1)
            mode, kind, oid = header.decode().split()
            if mode in ('100644', '100755') and kind == 'blob':
                objects[name.decode()] = oid
    for name, data in files.items():
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        check(objects.get(name) == blob, 'archive differs from Git: ' + name)
    check(manifest['source_sha'] == sha, 'manifest source SHA')


class Cutover:
    """Durable intent before every stage; uncertain external work never repeats."""
    def __init__(self, driver):
        self.d = driver

    def save(self, journal, phase):
        journal['phase'] = phase
        self.d.save(journal)

    def perform(self, journal, phase, action):
        self.save(journal, phase)
        result = action()
        self.save(journal, phase + '_done')
        return result

    def dry_run(self):
        # No journal, lock file, extraction, service or package mutation.
        return self.d.preflight()

    def apply(self):
        prior = self.d.load()
        if prior:
            check(prior['sha'] == self.d.sha and prior['digest'] == self.d.digest, 'existing different cutover')
            if prior['phase'] == 'complete':
                self.d.verify_active(prior)
                return prior
            raise core.StoreError('CUTOVER_REJECTED: prior intent requires --reconcile')
        report = self.d.preflight()
        journal = self.d.initial(report)
        self.save(journal, 'preparing')
        try:
            self.perform(journal, 'build', lambda: self.d.prepare(journal))
            # Recheck actual baseline after the long build, before any outage.
            self.d.recheck(journal)
            self.perform(journal, 'drain', lambda: self.d.drain(journal))
            journal['fence_started'] = True
            self.perform(journal, 'fence', lambda: self.d.fence(journal))
            journal['backup'] = self.perform(journal, 'backup', lambda: self.d.backup(journal))
            self.save(journal, 'backup_verified')
            journal['migration_started'] = True
            self.perform(journal, 'migration', lambda: self.d.migrate(journal))
            self.d.verify_migration(journal)
            return self.forward(journal)
        except BaseException as error:
            # Intent remains durable on SIGKILL/power loss too. BaseException here
            # covers a foreground interrupt without discarding the write fence.
            journal['error'] = type(error).__name__
            if not journal.get('migration_started') and journal['phase'] not in ('build', 'backup', 'fence'):
                try:
                    self.d.rollback_before_migration(journal)
                    self.save(journal, 'rolled_back')
                except BaseException:
                    self.save(journal, 'recovery_required')
            else:
                journal['interrupted_phase'] = journal['phase']
                self.save(journal, 'recovery_required')
            raise

    def forward(self, journal):
        self.perform(journal, 'activation', lambda: self.d.activate(journal))
        self.perform(journal, 'readiness', lambda: self.d.verify_active(journal))
        self.perform(journal, 'metadata', lambda: self.d.metadata(journal))
        # Persist before opening: new writes may happen even if the caller dies.
        journal['traffic_may_have_opened'] = True
        self.perform(journal, 'opening', lambda: self.d.open_traffic(journal))
        self.perform(journal, 'workers', lambda: self.d.resume_workers(journal))
        self.d.verify_active(journal)
        self.save(journal, 'complete')
        return journal

    def reconcile(self):
        journal = self.d.load()
        check(journal and journal['sha'] == self.d.sha and journal['digest'] == self.d.digest, 'reconciliation identity')
        self.d.external_stopped(journal)
        state = self.d.database_state(journal)
        if journal['phase'] == 'complete':
            self.d.verify_active(journal)
            return journal
        if journal.get('traffic_may_have_opened'):
            check(state == 'new', 'public traffic requires complete new schema')
            self.d.verify_active(journal)
            self.d.metadata(journal)
            self.d.open_traffic(journal)
            self.d.resume_workers(journal)
            self.save(journal, 'complete')
            return journal
        if state == 'new':
            self.d.verify_migration(journal)
            # Forward activation only; no migration replay and no old binary.
            return self.forward(journal)
        check(state == 'old' and not journal.get('migration_started'), 'migration uncertain/failed; preserve fence')
        self.d.rollback_before_migration(journal)
        self.save(journal, 'rolled_back')
        return journal


class Native:
    def __init__(self, repository, package, digest, sha, baseline):
        self.repository = Path(repository).resolve()
        self.package = Path(package).resolve()
        self.digest, self.sha = digest, sha
        self.baseline = Path(baseline).resolve()
        self.folder = core.ROOT / 'releases' / ('hubify-v180-' + sha[:12] + '-' + digest[:12])
        self.journal_path = core.CONFIG / 'hubify-promotions-cutover.json'
        spec = importlib.util.spec_from_file_location('hubify_observer', self.repository / 'deploy/hubify-promotions-observe.py')
        observer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(observer)
        self.observe = observer.observe

    def load(self):
        return core.read_json(self.journal_path) if self.journal_path.exists() else None

    def save(self, journal):
        core.atomic_json(self.journal_path, journal)
        print('CUTOVER_STAGE ' + journal['phase'], flush=True)

    def file_guards(self):
        names = [core.COMPOSE, core.CONFIG / 'version.json', core.CONFIG / 'runtime.env',
                 core.CONFIG / 'migration.env', core.CONFIG / 'Caddyfile', core.CONFIG / 'updater/config.json']
        return {str(p): transition.digest(p.read_bytes()) for p in names}

    def flags(self):
        lines = (core.CONFIG / 'runtime.env').read_text().splitlines()
        env = dict(line.split('=', 1) for line in lines if '=' in line and not line.startswith('#'))
        check(env.get('APP_ORIGIN') == 'https://hubify.web.id', 'origin environment')
        return {k: env.get(k) for k in FLAGS}

    def worker_idle(self):
        cfg = core.read_json(core.CONFIG / 'updater/config.json')
        db = Path(cfg['database'])
        if db.exists():
            with sqlite3.connect(db.as_uri() + '?mode=ro', uri=True) as connection:
                count = connection.execute("SELECT count(*) FROM jobs WHERE state NOT IN ('succeeded','failed','rolled_back')").fetchone()[0]
                check(count == 0, 'updater has active/queued/recovery work')

    def preflight(self, own_journal=False):
        check(os.geteuid() == 0, 'root operator required')
        self.worker_idle()
        for path in [core.CONFIG / 'update.json']:
            if path.exists():
                check(core.read_json(path).get('status') not in ('updating', 'failed', 'recovery_required'), 'unresolved prior updater')
        prior = self.load()
        check(not prior or (own_journal and prior['phase'] == 'build_done' and prior['sha'] == self.sha
                            and prior['digest'] == self.digest), 'prior cutover intent')
        candidate = transition.package(self.package, self.digest, self.sha, '1.8.0')
        baseline = transition.package(self.baseline, transition.BASE_ARCHIVE, transition.BASE_RELEASE_SOURCE, '1.7.4')
        verify_git_package(self.repository, self.sha, *candidate)
        bundle = self.observe()
        report = transition.review(bundle['observation'], bundle['runtime'], bundle['schema'], baseline, candidate, bundle['context'])
        check(self.flags() == {k: 'yes' for k in FLAGS} == report['observed_production_guards'], 'Production approval mismatch')
        import promotions_smoke
        promotions_smoke.verify(include_promotions=False)
        core.preserved_caddy_content(True, PROXY_HASHES)
        size = int(core.sql("SELECT pg_database_size('store');"))
        size += sum(p.stat().st_size for p in (core.DATA / 'media').rglob('*') if p.is_file())
        check(shutil.disk_usage(core.ROOT).free >= 6 * 1024**3 + 2 * size, 'insufficient disk for two images/backup/scratch restore')
        from update_service.engine import Engine
        Engine(None, {}).resources()
        self.manifest, self.files = candidate
        self.baseline_engine_sha = baseline[0]['files']['installer/update_service/engine.py']
        for path in [core.ROOT/'manager/update_service/engine.py', core.ROOT/'updater/update_service/engine.py']:
            check(path.is_file() and not path.is_symlink() and transition.digest(path.read_bytes()) == self.baseline_engine_sha,
                  'installed updater engine differs from authenticated baseline')
        self.bundle = bundle
        # This guarded operator path accepts only the named transition. It does
        # not change the generic updater/staging decision in the review report.
        return {'transition_accepted': True, 'production_mutations': False,
                'source_sha': self.sha, 'digest': self.digest, 'guards': self.file_guards(),
                'equivalence': report, 'free_disk': shutil.disk_usage(core.ROOT).free}

    def recheck(self, journal):
        self.preflight(own_journal=True)
        check(self.file_guards() == journal['guards'], 'configuration changed during build')

    def active(self, unit):
        return subprocess.run(['systemctl', 'is-active', '--quiet', unit], stdout=subprocess.DEVNULL).returncode == 0

    def initial(self, report):
        return {'sha': self.sha, 'digest': self.digest, 'from': self.bundle['observation']['version'],
                'old_compose': core.read_json(core.COMPOSE), 'guards': report['guards'],
                'flags': self.flags(), 'timer': self.active('single-store-maintenance.timer'),
                'updater': self.active('single-store-updater.service'),
                'manifest': self.manifest, 'folder': str(self.folder), 'backup': None,
                'migration_started': False, 'fence_started': False, 'started': int(time.time())}

    def prepare(self, journal):
        self.folder.mkdir(parents=True, mode=0o700, exist_ok=False)
        source = self.folder / 'source'
        source.mkdir(mode=0o755)
        for name, data in self.files.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            path.chmod(0o644)
        core.atomic_json(source/'release.json', self.manifest)
        core.atomic_json(source/'.hubify-provenance.json', {'source_sha': self.sha, 'app_tree': TARGET_TREE, 'archive_sha256': self.digest})
        candidate = copy.deepcopy(journal['old_compose'])
        from update_service.engine import Engine
        for name, target in [('tools', 'tools'), ('app', 'runtime')]:
            image = 'single-store-' + name + ':hubify-v180-' + self.sha[:12]
            candidate['services'][name].update(image=image, build={'context': str(source / 'app'), 'target': target})
            Engine(None, {}).build(source, image, target)
        candidate['services']['app'].setdefault('environment', {}).update(STORE_INSTALLED_VERSION='1.8.0', STORE_BUILD_SHA=self.sha)
        journal['candidate'] = candidate
        journal['image'] = core.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', candidate['services']['app']['image']])
        core.atomic_json(self.folder / 'compose.json', candidate)

    def drain(self, journal):
        check(self.file_guards() == journal['guards'], 'configuration changed since preflight')
        core.run(['systemctl', 'stop', 'single-store-updater.service'])
        self.worker_idle()
        # Install only the additional restrictive guard, after authenticating both
        # existing copies against v1.7.4. Keep the original bytes root-only.
        fresh = self.files['installer/update_service/engine.py']
        for index, path in enumerate([core.ROOT/'manager/update_service/engine.py', core.ROOT/'updater/update_service/engine.py']):
            check(transition.digest(path.read_bytes()) == self.baseline_engine_sha, 'updater engine changed before drain')
            shutil.copy2(path, self.folder/('previous-engine-' + str(index) + '.py'))
            temp = path.with_suffix('.cutover-tmp')
            temp.write_bytes(fresh); temp.chmod(0o644); os.replace(temp, path)
        journal['restrictive_worker_guard_installed'] = True
        core.run(['systemctl', 'stop', 'single-store-maintenance.timer'])
        deadline = time.monotonic() + 180
        while self.active('single-store-maintenance.service'):
            check(time.monotonic() < deadline, 'in-flight maintenance/carrier work; not killed')
            time.sleep(1)

    def fence(self, journal):
        check(self.flags() == journal['flags'], 'Production flags changed')
        core.write_caddy(core.read_json(core.STATE), live=False, preserve_extra_sites=True, approved_proxy_hashes=PROXY_HASHES)
        core.dc(['stop', '-t', '90', 'app'], timeout=120)
        check(core.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='store' AND pid<>pg_backend_pid() AND usename IN ('store_app','store_owner');") == '0', 'database writer still connected')
        journal['before_ledger'] = self.ledger_rows()
        journal['before_data'] = self.data_snapshot()

    def backup(self, journal):
        path = updater.backup()
        journal['backup'] = path
        self.save(journal)  # Preserve backup identity even if verification fails.
        updater.verify_backup(path)
        journal['backup_verified'] = True
        return path

    def ledger_rows(self):
        return json.loads(core.sql('SELECT coalesce(json_agg(to_jsonb(m) ORDER BY migration_name),\'[]\') FROM "_prisma_migrations" m;'))

    def data_snapshot(self):
        # Hash every existing row without returning customer/order details.
        tables = ['Product', 'ProductVariant', 'Inventory', 'FlashSaleCampaign', 'FlashSaleCampaignItem', 'FlashSaleControl', 'Coupon', 'Order', 'OrderItem']
        result = {}
        for name in tables:
            minus = "-'draft'" if name == 'FlashSaleCampaign' else "-'flashOfferId'" if name == 'OrderItem' else ''
            key = 'key' if name == 'FlashSaleControl' else 'id'
            value = core.sql('SELECT coalesce(json_agg(to_jsonb(t)' + minus + ' ORDER BY "' + key + '"),\'[]\') FROM "' + name + '" t;')
            result[name] = transition.digest(value.encode())
        return result

    def expected_ledger(self, journal):
        return {**journal['from']['migrations'], transition.NEW_NAME: transition.NEW_SQL}

    def database_state(self, journal):
        rows = self.ledger_rows()
        if any(not r['finished_at'] or r['rolled_back_at'] for r in rows):
            return 'uncertain'
        values = {r['migration_name']: r['checksum'] for r in rows}
        if len(rows) != len(values):
            return 'uncertain'
        if values == self.expected_ledger(journal):
            return 'new'
        if values == journal['from']['migrations']:
            return 'old'
        return 'uncertain'

    def migrate(self, journal):
        check(journal.get('backup_verified') and journal.get('backup'), 'verified backup required')
        check(self.database_state(journal) == 'old', 'migration baseline changed')
        name = 'single-store-promotions-migrate-' + self.sha[:12]
        core.dc(['run', '--rm', '-T', '--no-deps', '--name', name, 'tools', 'npm', 'run', 'db:migrate'], file=self.folder / 'compose.json', timeout=180)
        core.grant_runtime()

    def verify_migration(self, journal):
        check(self.database_state(journal) == 'new', 'migration did not finish exactly 29 to 30')
        old = [r for r in self.ledger_rows() if r['migration_name'] != transition.NEW_NAME]
        check(old == journal['before_ledger'], 'historical ledger rows changed')
        check(self.data_snapshot() == journal['before_data'], 'existing transaction/catalog/reservation data changed')
        check(core.sql('SELECT count(*) FROM "FlashSaleSkuOffer";') == '0', 'unexpected new offer before traffic')

    def activate(self, journal):
        check(self.flags() == journal['flags'], 'Production approvals changed')
        core.grant_runtime()  # Idempotent, also covers interruption after SQL commit.
        core.atomic_json(core.COMPOSE, journal['candidate'])
        core.dc(['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '90', 'app'], timeout=180)

    def verify_active(self, journal):
        check(self.database_state(journal) == 'new', 'active schema')
        core.healthy()
        cid = core.dc(['ps', '-q', 'app'])
        item = json.loads(core.run(['docker', 'inspect', cid]))[0]
        env = dict(line.split('=', 1) for line in item['Config']['Env'] if '=' in line)
        check(item['Image'] == journal['image'] and env.get('STORE_BUILD_SHA') == self.sha
              and env.get('STORE_INSTALLED_VERSION') == '1.8.0', 'active image/source/version')
        check({k: env.get(k) for k in FLAGS} == self.flags() == journal['flags'], 'Production guard changed')
        import promotions_smoke
        journal['smoke'] = promotions_smoke.verify()

    def metadata(self, journal):
        check(self.flags() == journal['flags'], 'Production guard changed')
        if not journal.get('traffic_may_have_opened'):
            self.verify_migration(journal)
        cfg = core.read_json(core.CONFIG / 'updater/config.json')
        core.atomic_json(cfg['baseline'], {'root': str(self.folder / 'source'), 'files': journal['manifest']['files']})
        core.atomic_json(core.CONFIG / 'version.json', {**journal['from'], 'version': '1.8.0',
            'source_sha': self.sha, 'migrations': self.expected_ledger(journal),
            'channel': cfg['channel'], 'candidate_version': '1.8.0',
            'artifact_sha256': self.digest, 'image_digest': journal['image'],
            'deployment': 'hubify-production', 'previous_source_sha': transition.BASE_SOURCE})

    def open_traffic(self, journal):
        core.write_caddy(core.read_json(core.STATE), live=True, preserve_extra_sites=True, approved_proxy_hashes=PROXY_HASHES)
        core.public_health(core.read_json(core.STATE))

    def resume_workers(self, journal):
        if journal['updater']:
            core.run(['systemctl', 'start', 'single-store-updater.service'])
        if journal['timer']:
            core.run(['systemctl', 'start', 'single-store-maintenance.timer'])

    def rollback_before_migration(self, journal):
        check(not journal.get('migration_started') and self.database_state(journal) == 'old', 'unsafe old application rollback')
        if journal.get('fence_started'):
            core.atomic_json(core.COMPOSE, journal['old_compose'])
            core.dc(['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '90', 'app'])
            core.healthy()
            core.write_caddy(core.read_json(core.STATE), live=True, preserve_extra_sites=True, approved_proxy_hashes=PROXY_HASHES)
            core.public_health(core.read_json(core.STATE))
        self.resume_workers(journal)

    def external_stopped(self, journal):
        names = core.run(['docker', 'ps', '--format', '{{.Names}}']).splitlines()
        check('single-store-promotions-migrate-' + self.sha[:12] not in names, 'migration container still running')
        phase = journal.get('interrupted_phase', journal['phase'])
        check(phase not in ('build', 'backup') or getattr(self, 'external_work_stopped', False),
              'uncertain build/backup needs operator inspection and --external-work-stopped; no replay')
