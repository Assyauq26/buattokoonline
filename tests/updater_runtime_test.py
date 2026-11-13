"""Runtime directory policy and pre-bootstrap source identity boundaries."""
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
if os.name!='posix':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
from update_service import service_runtime as runtime, fresh_worker_hook as fresh
from update_service.policy_operator import TARGET_SHA
from update_service.trust import Rejected


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        p=patch.object(runtime,'SYSTEMD',self.root);p.start();self.addCleanup(p.stop)
        p=patch.object(os,'geteuid',return_value=0,create=True);p.start();self.addCleanup(p.stop)
        p=patch('update_service.worker_upgrade.secure_path');p.start();self.addCleanup(p.stop)
    def test_dry_run_writes_nothing_and_does_not_reload(self):
        with patch('core.run') as run:
            result=runtime.preserve();self.assertFalse(result['applied']);self.assertEqual(list(self.root.iterdir()),[]);run.assert_not_called()
    def test_custom_dropin_refused_without_overwrite(self):
        directory=self.root/'single-store-updater.service.d';directory.mkdir();path=directory/'60-store-worker-runtime.conf';path.write_text('custom policy')
        with self.assertRaises(Rejected):runtime.preserve(apply=True)
        self.assertEqual(path.read_text(),'custom policy')
    @unittest.skipUnless(os.name=='posix','Directory fsync on Linux')
    def test_atomic_policy_idempotency_and_effective_setting(self):
        (self.root/'single-store-updater.service').write_text('[Service]\n')
        with patch('core.run',side_effect=lambda args:'yes' if 'show' in args else ''):
            result=runtime.preserve(apply=True);again=runtime.preserve(apply=True)
        self.assertEqual(Path(result['path']).read_bytes(),runtime.CONTENT);self.assertTrue(again['alreadyPresent'])
    @unittest.skipUnless(os.name=='posix','Directory fsync on Linux')
    def test_ineffective_systemd_override_fails_shut(self):
        (self.root/'single-store-updater.service').write_text('[Service]\n')
        with patch('core.run',return_value='no'):
            with self.assertRaises(Rejected):runtime.preserve(apply=True)


class FreshIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.state=self.root/'setup.json';self.compose=self.root/'compose.json'
        self.state.write_text(json.dumps({'source_sha':TARGET_SHA,'step':1}))
        self.compose.write_text(json.dumps({'services':{'app':{'environment':{'STORE_INSTALLED_VERSION':'1.8.0'}}}}))
        (self.root/'app').mkdir();(self.root/'app/test.txt').write_bytes(b'authenticated artifact bytes')
        for name,value in [('core.ROOT',self.root),('core.STATE',self.state),('core.COMPOSE',self.compose)]:
            p=patch(name,value);p.start();self.addCleanup(p.stop)
    def test_runtime_sha_bound_before_first_build(self):
        fresh.prepare_runtime_identity({'app/test.txt':b'authenticated artifact bytes'})
        self.assertEqual(json.loads(self.compose.read_text())['services']['app']['environment']['STORE_BUILD_SHA'],TARGET_SHA)
    def test_copied_app_tampering_refused(self):
        before=self.compose.read_bytes()
        with self.assertRaises(Rejected):fresh.prepare_runtime_identity({'app/test.txt':b'other'})
        self.assertEqual(self.compose.read_bytes(),before)
    def test_bootstrap_started_never_relabelled(self):
        self.state.write_text(json.dumps({'source_sha':TARGET_SHA,'bootstrap_started':True}));before=self.compose.read_bytes()
        with self.assertRaises(Rejected):fresh.prepare_runtime_identity({'app/test.txt':b'authenticated artifact bytes'})
        self.assertEqual(self.compose.read_bytes(),before)


if __name__=='__main__':unittest.main()
