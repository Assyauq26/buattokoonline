"""Isolated tests: no production credentials, Docker, DB, or service changes."""
import base64
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import types
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'installer'))
from update_service.availability import availability, upgrade_path
from update_service.upgrade_policy import authenticate, bind
from update_service.state import State
from update_service.trust import Rejected
from update_service.forward_cutover import ForwardCutover
from promotions_cutover_test import Fake
if os.name != 'posix':
    sys.modules.setdefault('fcntl', types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *args:None))
from update_service.worker_upgrade import inventory, idle
import sqlite3


class WorkerUpgradeTests(unittest.TestCase):
    def test_source_inventory_and_tampering(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)
            def git(*args): return subprocess.check_output(['git','-C',folder,*args],stderr=subprocess.DEVNULL).decode().strip()
            git('init');git('config','core.autocrlf','false')
            for name in ('core.py','updater.py','update_service/server.py'):
                path=p/'installer'/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'# test\n')
            git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture')
            sha=git('rev-parse','HEAD')
            self.assertEqual(len(inventory(p,sha)),3)
            (p/'installer/core.py').write_bytes(b'# tampered\n')
            with self.assertRaises(Rejected): inventory(p,sha)
            with self.assertRaises(Rejected): inventory(p,'a'*40)
    def test_active_job_blocks_worker_replacement(self):
        with tempfile.TemporaryDirectory() as folder:
            state=State(Path(folder)/'state.sqlite','test')
            idle({'database':state.path})
            state.start('admin','test',release())
            with self.assertRaises(Rejected): idle({'database':state.path})


class ForwardDriver(Fake):
    def backup_and_restore_verify(self,j): return self.backup(j)
    def verify_identity(self,j):
        if (j['sha'],j['digest']) != (self.sha,self.digest): raise Rejected('identity')
    def external_work_stopped(self,j): self.step('external_stopped')


class ForwardTests(unittest.TestCase):
    def test_dry_run_never_saves_intent(self):
        d=ForwardDriver();ForwardCutover(d).dry_run()
        self.assertIsNone(d.journal);self.assertEqual(d.calls,['preflight'])
    def test_success(self):
        d=ForwardDriver();self.assertEqual(ForwardCutover(d).apply()['phase'],'complete')
    def test_crash_at_every_external_phase(self):
        for phase in ('build','drain','fence','backup','migration','verify_migration','activation','readiness','metadata','opening','workers'):
            with self.subTest(phase=phase):
                d=ForwardDriver(phase)
                with self.assertRaises(RuntimeError): ForwardCutover(d).apply()
                self.assertEqual(d.journal['phase'],'recovery_required')
                self.assertNotIn('rollback',d.calls)
    def test_no_replay_after_sql_intent(self):
        d=ForwardDriver('migration'); e=ForwardCutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail=None;d.calls.clear()
        with self.assertRaises(Rejected): e.reconcile()
        self.assertNotIn('migration',d.calls); self.assertTrue(d.fenced)
    def test_new_schema_forward_activation_only(self):
        d=ForwardDriver('activation');e=ForwardCutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail=None;d.calls.clear();e.reconcile()
        self.assertNotIn('migration',d.calls); self.assertNotIn('rollback',d.calls)
    def test_post_open_unhealthy_does_not_restore(self):
        d=ForwardDriver('workers');e=ForwardCutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail='readiness';d.calls.clear()
        with self.assertRaises(RuntimeError): e.reconcile()
        self.assertNotIn('rollback',d.calls);self.assertNotIn('migration',d.calls)
    def test_pre_sql_verified_old_schema_can_recover(self):
        d=ForwardDriver('backup');e=ForwardCutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail=None;self.assertEqual(e.reconcile()['phase'],'rolled_back')
    def test_unknown_daemon_work_blocks_recovery(self):
        d=ForwardDriver('activation');e=ForwardCutover(d)
        with self.assertRaises(RuntimeError): e.apply()
        d.fail='external_stopped'
        with self.assertRaises(RuntimeError): e.reconcile()
    def test_existing_intent_requires_reconcile(self):
        d=ForwardDriver();e=ForwardCutover(d);e.apply()
        with self.assertRaises(Rejected): e.apply()


def release():
    return dict(version='1.8.0',sha='a'*40,digest='b'*64,notes='',channel='stable',
        minimumUpdater=2,dbContract=1,minimumInstalledVersion='1.7.4',maximumInstalledVersion='1.7.4',rollbackCompatible=False)


class AvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.release=release(); self.cat=dict(releases=[self.release],revoked=[])
        self.installed=dict(version='1.7.4',db_contract=1)
    def status(self): return availability(self.cat,self.installed,'stable',2)
    def test_incompatible_release_visible(self):
        self.assertEqual(self.status()['latest']['version'],'1.8.0')
        self.assertEqual(self.status()['reason'],'operator_migration_required')
    def test_worker_upgrade(self):
        self.release['minimumUpdater']=3
        self.assertEqual(self.status()['reason'],'worker_upgrade_required')
    def test_unsupported_source(self):
        self.installed['version']='1.7.2'
        self.assertEqual(self.status()['reason'],'upgrade_path_unsupported')
    def test_unknown_catalog_never_current(self):
        self.assertEqual(availability(None,self.installed,'stable',2,False)['state'],'check_required')
    def test_revoked_and_pilot_hidden(self):
        self.cat['revoked']=['a'*40];self.assertEqual(self.status()['state'],'current')
        self.cat['revoked']=[];self.release['channel']='pilot';self.assertEqual(self.status()['state'],'current')
    def test_supported_release(self):
        self.release['rollbackCompatible']=True
        self.assertEqual(self.status()['state'],'available')
    def test_no_downgrade(self):
        self.installed['version']='1.8.0'; self.assertEqual(self.status()['state'],'current')
    def test_multihop_never_skips_source_constraint(self):
        self.release['rollbackCompatible']=True
        old={**self.release,'version':'1.7.4','sha':'c'*40,'minimumInstalledVersion':'1.7.3','maximumInstalledVersion':'1.7.3'}
        self.cat['releases'].append(old);self.installed['version']='1.7.3'
        self.assertEqual(upgrade_path(self.cat,self.installed,'1.8.0','stable',2),['c'*40,'a'*40])
        self.assertEqual(self.status()['nextRelease']['version'],'1.7.4')
        self.cat['revoked']=['c'*40]
        self.assertEqual(self.status()['reason'],'upgrade_path_unsupported')


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.p=Path(self.temp.name)
        subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(self.p/'key')],check=True,capture_output=True)
        public=subprocess.check_output(['openssl','pkey','-in',str(self.p/'key'),'-pubout']).decode()
        self.roots={'test':public}
        self.before={'20261109120000_order_resolution_workflow':'c'*64}
        self.policy=dict(format=1,repository='Assyauq26/buattokoonline',id='test-only',sequence=1,issuedAt=1000,expiresAt=2000,
            fromVersion='1.7.4',toVersion='1.8.0',artifactDigest='b'*64,sourceSha='a'*40,baselineAppTree='d'*40,
            minimumWorker=3,failureStrategy='forward-only-after-migration',executor='forward-cutover-v1',
            beforeMigrations=self.before,afterMigrations={**self.before,'20261112050000_promotion_sku_offers':'e'*64})
    def envelope(self,policy=None):
        raw=json.dumps(policy or self.policy).encode();(self.p/'payload').write_bytes(raw)
        subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(self.p/'key'),'-rawin','-in',str(self.p/'payload'),'-out',str(self.p/'sig')],check=True,capture_output=True)
        return json.dumps(dict(keyId='test',payload=base64.b64encode(raw).decode(),signature=base64.b64encode((self.p/'sig').read_bytes()).decode())).encode()
    def test_real_signature(self): self.assertEqual(authenticate(self.envelope(),self.roots,1500)[0],self.policy)
    def test_revoked_key(self):
        with self.assertRaises(Rejected): authenticate(self.envelope(),{},1500)
    def test_expired_or_future(self):
        for now in (900,2000):
            with self.assertRaises(Rejected): authenticate(self.envelope(),self.roots,now)
    def test_tampered_payload(self):
        raw=json.loads(self.envelope());raw['payload']=base64.b64encode(b'{}').decode()
        with self.assertRaises(Rejected): authenticate(json.dumps(raw).encode(),self.roots,1500)
    def test_historical_checksum_change_rejected(self):
        self.policy['afterMigrations'][next(iter(self.before))]='f'*64
        with self.assertRaises(Rejected): authenticate(self.envelope(),self.roots,1500)
    def test_binding_guards(self):
        installed=dict(version='1.7.4',migrations=self.before)
        bind(self.policy,release(),installed,'d'*40,self.before,3)
        for kwargs in [dict(worker=2),dict(app_tree='e'*40),dict(ledger={}),dict(release={**release(),'digest':'f'*64})]:
            args=dict(policy=self.policy,release=release(),installed=installed,app_tree='d'*40,ledger=self.before,worker=3);args.update(kwargs)
            with self.assertRaises(Rejected): bind(**args)
    def test_persistent_replay_equivocation(self):
        state=State(self.p/'state.sqlite','test')
        state.policy(self.policy,'a'*64);state.policy(self.policy,'a'*64)
        with self.assertRaises(Rejected): state.policy(self.policy,'b'*64)
        state.policy({**self.policy,'sequence':2},'c'*64)
        with self.assertRaises(Rejected): state.policy(self.policy,'a'*64)


if __name__=='__main__': unittest.main()
