"""Narrow compatibility review tests. Never invokes a deployment or contacts J&T."""
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
import core
import release
import promotions_transition as t


class PackageTests(unittest.TestCase):
    def test_exact_archive_and_full_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'candidate.tar.gz'
            manifest = release.pack(ROOT, path, fixture=True)
            sha = t.digest(path.read_bytes())
            got, files = t.package(path, sha, manifest['source_sha'], '1.8.0')
            self.assertEqual(got, manifest)
            self.assertEqual(t.digest(files['app/prisma/migrations/' + t.NEW_NAME + '/migration.sql']), t.NEW_SQL)
            for digest, source, version in [('0' * 64, manifest['source_sha'], '1.8.0'),
                                            (sha, 'a' * 40, '1.8.0'), (sha, manifest['source_sha'], '1.7.4')]:
                with self.assertRaises(core.StoreError):
                    t.package(path, digest, source, version)

    def test_unsafe_duplicate_and_symlink_archives_rejected(self):
        for kind in ['traversal', 'duplicate', 'symlink']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder:
                p = Path(folder) / 'unsafe.tar.gz'
                with tarfile.open(p, 'w:gz') as archive:
                    member = tarfile.TarInfo('../escape' if kind == 'traversal' else 'VERSION')
                    member.size = 1
                    if kind == 'symlink':
                        member.type = tarfile.SYMTYPE
                        member.linkname = '/etc/passwd'
                    archive.addfile(member, io.BytesIO(b'x'))
                    if kind == 'duplicate':
                        archive.addfile(member, io.BytesIO(b'x'))
                with self.assertRaises(core.StoreError):
                    t.package(p, t.digest(p.read_bytes()), 'a' * 40, '1.8.0')


ARCHIVE = Path(os.environ.get('PROMOTION_BASELINE_ARCHIVE', ROOT / 'promotion-evidence/store-v1.7.4.tar.gz'))


@unittest.skipUnless(ARCHIVE.is_file(), 'Pinned v1.7.4 archive required; mandatory management CI supplies it')
class TransitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = t.package(ARCHIVE, t.BASE_ARCHIVE, t.BASE_RELEASE_SOURCE, '1.7.4')
        cls.temp = tempfile.TemporaryDirectory()
        path = Path(cls.temp.name) / 'candidate.tar.gz'
        m = release.pack(ROOT, path, fixture=True)
        cls.candidate = t.package(path, t.digest(path.read_bytes()), m['source_sha'], '1.8.0')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        manifest, files = self.baseline
        expected = dict(manifest['migrations'])
        records = {}
        for name, pair in t.history.PAIRS.items():
            expected[name] = pair[0]
            raw = (ROOT / 'tests/fixtures/historical-eol' / (name + '.bin')).read_bytes()
            records[name] = {label: {'base64': base64.b64encode(raw).decode()} for label in ['active', 'original']}
        self.observation = {
            'version': {'version': '1.7.3', 'source_sha': t.BASE_SOURCE, 'channel': 'hubify-staging',
                        'db_contract': 1, 'migrations': expected},
            'source_commit': t.BASE_SOURCE, 'app_tree': t.BASE_TREE, 'source_version': '1.7.3',
            'source_inventory': expected, 'historical_files': records,
            'app_environment': {'STORE_BUILD_SHA': t.BASE_SOURCE, 'STORE_INSTALLED_VERSION': '1.7.3'},
            'containers': [{'service': 'app', 'image': t.BASE_IMAGE, 'running': True, 'health': 'healthy'}],
            'database': {'ledger': [{'migration_name': n, 'checksum': h, 'finished': True,
                                     'rolled_back': False} for n, h in expected.items()]},
        }
        self.runtime = {p: {'sha256': expected[Path(p).parent.name] if p.endswith('/migration.sql')
                           else t.digest(files[p])} for p in t.runtime_paths(files)}
        self.context = {'installation': t.history.INSTALLATION, 'origin': 'https://hubify.web.id'}
        # Unit fixture isolates the state-machine checks; a real catalog comparison
        # and its production-pinned fingerprint are exercised by the offline CLI.
        self.schema = {'unit_fixture': True}
        self.patch = patch.object(t, 'BASE_SCHEMA', t.digest(json.dumps(self.schema, sort_keys=True, separators=(',', ':')).encode()))
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.candidate = copy.deepcopy(self.__class__.candidate)

    def review(self):
        return t.review(self.observation, self.runtime, self.schema, self.baseline, self.candidate, self.context)

    def test_exact_transition_accepts_equivalence_but_not_deployment(self):
        before = copy.deepcopy((self.observation, self.runtime, self.candidate))
        report = self.review()
        self.assertTrue(report['equivalence_accepted'])
        self.assertEqual(report['runtime_files_verified'], 552)
        self.assertFalse(report['deployment_allowed'])
        self.assertEqual(report['migration_execution'], 'not_started')
        self.assertEqual(report['decision'], 'NO-GO')
        self.assertEqual(before, (self.observation, self.runtime, self.candidate))

    def test_wrong_store_source_image_or_schema_rejected(self):
        for location, key, value in [(self.context, 'installation', 'foreign'),
                                     (self.context, 'origin', 'https://other.test'),
                                     (self.observation, 'source_commit', 'a' * 40),
                                     (self.observation['version'], 'version', '1.7.4'),
                                     (self.observation['containers'][0], 'image', 'sha256:' + '0' * 64),
                                     (self.observation['app_environment'], 'STORE_BUILD_SHA', 'a' * 40)]:
            old = location[key]
            location[key] = value
            with self.subTest(key=key), self.assertRaises(core.StoreError): self.review()
            location[key] = old
        self.schema['drift'] = True
        with self.assertRaises(core.StoreError): self.review()

    def test_duplicate_unfinished_rolled_back_or_missing_ledger_rejected(self):
        original = copy.deepcopy(self.observation['database']['ledger'])
        for kind in ['duplicate', 'unfinished', 'rolled_back', 'missing', 'checksum']:
            rows = copy.deepcopy(original)
            if kind == 'duplicate': rows.append(rows[0])
            elif kind == 'unfinished': rows[0]['finished'] = False
            elif kind == 'rolled_back': rows[0]['rolled_back'] = True
            elif kind == 'missing': rows.pop()
            else: rows[0]['checksum'] = '0' * 64
            self.observation['database']['ledger'] = rows
            with self.subTest(kind=kind), self.assertRaises(core.StoreError): self.review()

    def test_substantive_sql_unknown_eol_and_wrong_original_rejected(self):
        name = next(iter(t.history.PAIRS))
        original = self.observation['historical_files'][name]['original']['base64']
        for raw in [base64.b64decode(original) + b'\nSELECT 1;',
                    base64.b64decode(original).replace(b'\r\n', b'\n'), b'unknown']:
            self.observation['historical_files'][name]['original']['base64'] = base64.b64encode(raw).decode()
            with self.subTest(raw=len(raw)), self.assertRaises(core.StoreError): self.review()

    def test_missing_extra_or_changed_runtime_rejected(self):
        original = copy.deepcopy(self.runtime)
        for kind in ['missing', 'extra', 'changed']:
            self.runtime = copy.deepcopy(original)
            if kind == 'missing': self.runtime.pop(next(iter(self.runtime)))
            elif kind == 'extra': self.runtime['app/foreign.js'] = {'sha256': '0' * 64}
            else: self.runtime[next(iter(self.runtime))] = {'sha256': '0' * 64}
            with self.subTest(kind=kind), self.assertRaises(core.StoreError): self.review()

    def test_historical_changes_extra_migration_and_policy_bypass_rejected(self):
        original = copy.deepcopy(self.candidate)
        for kind in ['historical', 'extra', 'sql', 'rollback', 'range']:
            self.candidate = copy.deepcopy(original)
            m, files = self.candidate
            if kind == 'historical': files['app/prisma/migrations/' + next(iter(t.history.PAIRS)) + '/migration.sql'] += b'\n'
            elif kind == 'extra': m['migrations']['20990101000000_foreign'] = '0' * 64
            elif kind == 'sql': m['migrations'][t.NEW_NAME] = '0' * 64
            elif kind == 'rollback': m['compatibility']['rollback_compatible'] = True
            else: m['compatibility']['minimum_installed_version'] = '1.7.3'
            with self.subTest(kind=kind), self.assertRaises(core.StoreError): self.review()


if __name__ == '__main__':
    unittest.main()
