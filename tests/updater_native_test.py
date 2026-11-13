"""Native boundaries and actual Linux directory exchange; no live store writes."""
import copy
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
if os.name!='posix':
    sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
from update_service import worker_upgrade as worker
from update_service.native_forward import NativeForward
from update_service.state import State
from update_service.trust import Rejected


class NativeTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Node parser on local test host')
    def test_runtime_inventory_probe_is_valid_javascript(self):
        driver=object.__new__(NativeForward);driver.e=types.SimpleNamespace(baseline=lambda:None)
        driver.config={'baseline':'test-only','origin':'https://example.test','installation':'a'*32};driver.policy={'baselineFiles':{'app/Dockerfile':'a'*64}}
        def execute(args,**kw):
            if args[:2]==['ps','-q']:return 'fixture'
            subprocess.run(['node','--check','-'],input=args[-1].encode(),check=True,capture_output=True)
            return json.dumps(driver.policy['baselineFiles'])
        def read(path):return {'files':driver.policy['baselineFiles']} if path=='test-only' else {'source_sha':'a'*40,'version':'1.7.4'}
        with patch('core.read_json',side_effect=read),patch('core.dc',side_effect=execute),patch('core.run',return_value=json.dumps([{'Config':{'Env':['STORE_BUILD_SHA='+'a'*40,'STORE_INSTALLED_VERSION=1.7.4','APP_ORIGIN=https://example.test','STORE_UPDATER_ENABLED=1','STORE_INSTALLATION_ID='+'a'*32]}}])):driver.baseline()
    @unittest.skipUnless(shutil.which('node'),'Node syntax check runs on local Node test host')
    def test_socket_probe_is_valid_javascript(self):
        driver=object.__new__(NativeForward)
        calls=[]
        def execute(args,**kw):
            js=args[-1];calls.append(js)
            subprocess.run(['node','--check','-'],input=js.encode(),check=True,capture_output=True)
            return '0'
        with patch('core.dc',side_effect=execute):self.assertTrue(driver.sockets_idle())
        self.assertEqual(len(calls),1)
    @unittest.skipUnless(shutil.which('node'),'Node socket classifier on local test host')
    def test_socket_probe_waits_for_http_and_carrier_but_not_idle_db_pool(self):
        driver=object.__new__(NativeForward)
        for remote,expected in [('1538',True),('01BB',False),('C123',False)]:
            data='header\n 0: 0100007F:0BB8 0100007F:'+remote+' 01 rest\n'
            def execute(args,**kw):
                js="require('fs').readFileSync=()=>"+json.dumps(data)+';'+args[-1]
                return subprocess.check_output(['node','-e',js],text=True).strip()
            with patch('core.dc',side_effect=execute):self.assertEqual(driver.sockets_idle(),expected)
    def test_carrier_unknown_or_prepared_is_never_treated_as_complete(self):
        driver=object.__new__(NativeForward)
        with patch('core.sql',return_value='1') as sql:
            self.assertFalse(driver.carrier_idle())
            self.assertIn("'PREPARED','DISPATCHED','UNKNOWN'",sql.call_args.args[0])
    def test_partial_or_duplicate_ledger_is_uncertain(self):
        driver=object.__new__(NativeForward)
        j={'policy':{'beforeMigrations':{'old':'a'},'afterMigrations':{'old':'a','new':'b'}}}
        row={'migration_name':'old','checksum':'a','finished_at':'time','rolled_back_at':None}
        for rows in ([{**row,'finished_at':None}],[row,row],[{**row,'checksum':'other'}]):
            with patch.object(driver,'ledger_rows',return_value=rows):self.assertEqual(driver.database_state(j),'uncertain')
    def test_old_code_refused_after_sql_intent(self):
        driver=object.__new__(NativeForward)
        with patch.object(driver,'database_state',return_value='old'),patch('core.dc') as dc:
            with self.assertRaises(Rejected):driver.rollback_before_migration({'migration_started':True})
            dc.assert_not_called()


@unittest.skipUnless(sys.platform=='linux','Actual Linux renameat2 and crash recovery')
class WorkerLinuxTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.p=Path(self.tmp.name)
        self.source=self.p/'source';self.source.mkdir()
        def git(*args):return subprocess.check_output(['git','-C',str(self.source),*args],stderr=subprocess.DEVNULL).decode().strip()
        git('init');git('config','core.autocrlf','false')
        for name in ('core.py','updater.py','update_service/server.py','update_service/__init__.py'):
            p=self.source/'installer'/name;p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(b'VERSION = 3\n' if name.endswith('__init__.py') else b'# candidate\n')
        git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture')
        self.sha=git('rev-parse','HEAD');self.root=self.p/'store';self.target=self.root/'updater'
        (self.target/'update_service').mkdir(parents=True)
        (self.target/'update_service/__init__.py').write_text('VERSION = 2\n')
        self.cfg=self.p/'etc';(self.cfg/'updater').mkdir(parents=True)
        state=State(self.p/'state.sqlite','test')
        (self.cfg/'updater/config.json').write_text(json.dumps({'database':state.path}))
        (self.cfg/'Caddyfile').write_text('test fixture only')
        self.before=worker.files_digest(self.target)
        for name,value in [('core.ROOT',self.root),('core.CONFIG',self.cfg),('update_service.worker_upgrade.OPERATION_LOCK',self.p/'lock')]:
            p=patch(name,value);p.start();self.addCleanup(p.stop)
        p=patch('core.run',return_value='');p.start();self.addCleanup(p.stop)
        p=patch.object(worker,'health');p.start();self.addCleanup(p.stop)
        p=patch('update_service.service_runtime.preserve',return_value={'applied':True});p.start();self.addCleanup(p.stop)
        for name in ('enable','finish','restore'):
            p=patch('update_service.ui_route.'+name);p.start();self.addCleanup(p.stop)
    def test_atomic_install_and_idempotent_recovery(self):
        result=worker.install(self.source,self.sha,True)
        self.assertTrue(result['applied']);self.assertNotEqual(worker.files_digest(self.target),self.before)
        self.assertEqual(worker.recover(self.source,self.sha)['phase'],'complete')
    def test_failed_health_rolls_worker_back_without_database_mutation(self):
        with patch.object(worker,'health',side_effect=[Rejected('worker_health'),None]):
            with self.assertRaises(Rejected):worker.install(self.source,self.sha,True)
        self.assertEqual(worker.files_digest(self.target),self.before)
        self.assertEqual(json.loads((self.cfg/'updater/worker-upgrade.json').read_text())['phase'],'rolled_back')
    def crash(self,point):
        real_json=worker.core.atomic_json;real_exchange=worker.exchange
        pid=os.fork()
        if pid==0:
            def save(path,value):
                real_json(path,value)
                if value.get('phase')==point:os._exit(70)
            def swap(a,b):
                real_exchange(a,b)
                if point=='exchanged':os._exit(70)
            def health():
                if point=='healthy':os._exit(70)
            with patch('core.atomic_json',side_effect=save),patch.object(worker,'exchange',side_effect=swap),patch.object(worker,'health',side_effect=health):
                worker.install(self.source,self.sha,True)
            os._exit(0)
        _,status=os.waitpid(pid,0);self.assertEqual(os.waitstatus_to_exitcode(status),70)
        self.assertTrue(self.target.is_dir())
        result=worker.recover(self.source,self.sha)
        self.assertIn(result['phase'],('complete','rolled_back'))
    def test_crash_prepared(self):self.crash('prepared')
    def test_crash_switching(self):self.crash('switching')
    def test_crash_exchanged(self):self.crash('exchanged')
    def test_crash_healthy(self):self.crash('healthy')
