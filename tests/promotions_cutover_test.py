"""Failure/reconciliation contract for the operator path; no production services."""
import copy
import importlib.util
import json
from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
import core
import promotions_cutover as p


class Fake:
    sha, digest = 'a' * 40, 'b' * 64
    def __init__(self, fail=None):
        self.journal = None
        self.calls = []
        self.fail = fail
        self.db = 'old'
        self.fenced = False
        self.workers = True
    def load(self): return copy.deepcopy(self.journal)
    def save(self, j): self.journal = copy.deepcopy(j)
    def step(self, name):
        self.calls.append(name)
        if self.fail == name: raise RuntimeError('injected ' + name)
    def preflight(self): self.step('preflight'); return {'accepted': True}
    def recheck(self, j): self.step('recheck')
    def initial(self, report): return {'sha': self.sha, 'digest': self.digest, 'migration_started': False}
    def prepare(self, j): self.step('build')
    def drain(self, j): self.step('drain'); self.workers = False
    def fence(self, j): self.step('fence'); self.fenced = True
    def backup(self, j): self.step('backup'); return 'verified-scratch-backup'
    def migrate(self, j): self.step('migration'); self.db = 'new'
    def verify_migration(self, j): self.step('verify_migration'); p.check(self.db == 'new', 'schema')
    def activate(self, j): self.step('activation')
    def verify_active(self, j): self.step('readiness')
    def metadata(self, j): self.step('metadata')
    def open_traffic(self, j): self.step('opening'); self.fenced = False
    def resume_workers(self, j): self.step('workers'); self.workers = True
    def database_state(self, j): return self.db
    def external_stopped(self, j): self.step('external_stopped')
    def rollback_before_migration(self, j):
        p.check(not j.get('migration_started') and self.db == 'old', 'unsafe rollback')
        self.step('rollback'); self.fenced = False; self.workers = True


class CutoverTests(unittest.TestCase):
    def test_dry_run_has_no_persisted_or_service_mutation(self):
        d = Fake(); p.Cutover(d).dry_run()
        self.assertIsNone(d.journal); self.assertEqual(d.calls, ['preflight']); self.assertTrue(d.workers)
    def test_success_has_ordered_backup_migration_readiness_metadata_open(self):
        d = Fake(); j = p.Cutover(d).apply()
        self.assertEqual(j['phase'], 'complete')
        self.assertEqual(d.calls, ['preflight','build','recheck','drain','fence','backup','migration',
                                  'verify_migration','activation','readiness','metadata','opening','workers','readiness'])
    def test_preflight_rejection_never_creates_journal(self):
        d = Fake('preflight')
        with self.assertRaises(RuntimeError): p.Cutover(d).apply()
        self.assertIsNone(d.journal)
    def test_completed_apply_does_not_repeat_backup_migration_activation(self):
        d = Fake(); e = p.Cutover(d); e.apply(); d.calls.clear(); e.apply()
        self.assertEqual(d.calls, ['readiness'])
    def test_failures_keep_recovery_fence_and_never_restore_database(self):
        for phase in ['backup','migration','verify_migration','activation','readiness','metadata','opening','workers']:
            with self.subTest(phase=phase):
                d = Fake(phase)
                with self.assertRaises(RuntimeError): p.Cutover(d).apply()
                self.assertEqual(d.journal['phase'], 'recovery_required')
                self.assertNotIn('rollback', d.calls)
                if phase not in ('opening','workers'): self.assertTrue(d.fenced)
    def test_configuration_change_during_build_stops_before_outage(self):
        d = Fake('recheck')
        with self.assertRaises(RuntimeError): p.Cutover(d).apply()
        self.assertFalse(d.fenced); self.assertNotIn('migration', d.calls)
    def test_interruption_after_sql_commit_reconciles_forward_without_migrate(self):
        d = Fake('activation'); e = p.Cutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail = None; d.calls.clear(); e.reconcile()
        self.assertNotIn('migration', d.calls); self.assertNotIn('rollback', d.calls)
        self.assertEqual(d.journal['phase'], 'complete')
    def test_partial_or_failed_ledger_cannot_reconcile(self):
        d = Fake('migration'); e = p.Cutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        for db in ['old','uncertain']:
            d.db = db; d.fail = None
            with self.assertRaises(core.StoreError): e.reconcile()
        self.assertTrue(d.fenced)
    def test_interruption_before_migration_restores_only_application(self):
        d = Fake('backup'); e = p.Cutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail = None; d.calls.clear(); e.reconcile()
        self.assertEqual(d.db, 'old'); self.assertIn('rollback', d.calls); self.assertNotIn('migration', d.calls)
    def test_interruption_after_open_never_restarts_old_binary_or_rechecks_old_snapshots(self):
        d = Fake('workers'); e = p.Cutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail = None; d.calls.clear(); e.reconcile()
        self.assertNotIn('activation', d.calls); self.assertNotIn('verify_migration', d.calls)
        self.assertNotIn('migration', d.calls); self.assertNotIn('rollback', d.calls)
    def test_different_candidate_refused_on_existing_intent(self):
        d = Fake(); e = p.Cutover(d); e.apply(); d.sha = 'c' * 40
        with self.assertRaises(core.StoreError): e.apply()
    @unittest.skipIf(os.name != 'posix', 'Real POSIX shared deployment lock tested in Linux CI')
    def test_shared_lock_prevents_second_cutover(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / 'operation.lock')
            with p.operation_lock(path):
                with self.assertRaises(core.StoreError):
                    with p.operation_lock(path): pass
            with p.operation_lock(path): pass


class NativeGuardTests(unittest.TestCase):
    def test_restricted_launcher_rejects_argument_or_path_injection(self):
        spec=importlib.util.spec_from_file_location('launcher',ROOT/'deploy/hubify-promotions-launcher.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        for args in [[],['--apply'],['a'*40+';id','b'*64],['a'*40,'b'*64,'--unsafe']]:
            with self.subTest(args=len(args)), self.assertRaises(ValueError):module.command(args)
    def test_workflow_keeps_protected_environment_and_exact_sha_checks(self):
        text=(ROOT/'.github/workflows/deploy-hubify.yml').read_text(encoding='utf8')
        for marker in ['environment: hubify-staging','test "$HEAD_SHA" = "$SHA"','promotions-v180','hubify-promotions-cutover','StrictHostKeyChecking=yes']:
            self.assertIn(marker,text)
    def test_carrier_approval_flags_are_preserved_and_checked(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(core, 'CONFIG', Path(folder)):
            file = Path(folder) / 'runtime.env'
            file.write_text('APP_ORIGIN=https://hubify.web.id\n' + '\n'.join(k+'=yes' for k in p.FLAGS))
            d = object.__new__(p.Native)
            before = file.read_bytes(); self.assertEqual(d.flags(), {k:'yes' for k in p.FLAGS})
            self.assertEqual(before, file.read_bytes())
            file.write_text('APP_ORIGIN=https://another.test')
            with self.assertRaises(core.StoreError): d.flags()
    def test_no_generic_policy_or_staging_guard_is_weakened(self):
        policy = json.loads((ROOT/'release-policy.json').read_text())
        self.assertFalse(policy['rollback_compatible']); self.assertEqual(policy['minimum_installed_version'],'1.7.4')
        text = (ROOT/'staging/hubify-staging-deploy.py').read_text(encoding='utf8')
        self.assertIn("raise core.StoreError('J&T Production tidak boleh diaktifkan di staging.')", text)
    def test_new_schema_never_allows_old_binary_recovery(self):
        d = object.__new__(p.Native)
        with patch.object(d, 'database_state', return_value='new'):
            with self.assertRaises(core.StoreError): d.rollback_before_migration({'migration_started':True})
    @unittest.skipIf(os.name != 'posix', 'Native worker imports POSIX locking')
    def test_normal_updater_cannot_cross_operator_recovery_fence(self):
        from update_service.engine import operator_cutover_guard
        from update_service.trust import Rejected
        with tempfile.TemporaryDirectory() as folder, patch.object(core, 'CONFIG', Path(folder)):
            path=Path(folder)/'hubify-promotions-cutover.json'
            for phase in ['migration','recovery_required','opening_done']:
                path.write_text(json.dumps({'phase':phase}))
                with self.assertRaises(Rejected): operator_cutover_guard()
            path.write_text(json.dumps({'phase':'complete'}));operator_cutover_guard()


if __name__ == '__main__': unittest.main()
