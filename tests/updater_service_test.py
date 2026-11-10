"""Isolated failure/security tests; never contacts Docker, live DB, or internet."""
import base64, copy, hashlib, json, os, subprocess, sys, tempfile, threading, types, unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'installer'))
if os.name != 'posix':
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *args:None)
    import socketserver
    socketserver.UnixStreamServer = socketserver.TCPServer
from update_service.trust import verify, Rejected, download, SafeRedirect
from update_service.state import State
from update_service.bootstrap import plan
from update_service.activate import add_route
from update_service.engine import Engine
from update_service.server import Controller
from update_service.server import Handler, StatusServer
from update_service.package import extract
from update_service.new_install import install_new
import core

def release():
    return dict(version='1.7.0',sha='a'*40,digest='b'*64,size=100,url='https://github.com/Assyauq26/buattokoonline/releases/download/v1.7.0/store-v1.7.0.tar.gz',channel='pilot',minimumUpdater=2,minimumInstalledVersion='1.6.3',maximumInstalledVersion='1.6.3',rollbackCompatible=True,dbContract=1,notes='test')
def catalog():
    return dict(format=2,repository='Assyauq26/buattokoonline',sequence=1,issuedAt=1000,expiresAt=2000,releases=[release()],revoked=[])

class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'state.sqlite';self.s=State(self.path,'store1')
    def test_two_admins_only_one_job(self):
        with ThreadPoolExecutor(8) as pool:
            jobs=list(pool.map(lambda i:self.s.start('admin'+str(i),str(i),release()),range(16)))
        self.assertEqual(len({j['id'] for j in jobs}),1)
    def test_database_cannot_change_installation(self):
        with self.assertRaises(Rejected):State(self.path,'other-store')
    def test_idempotent_after_terminal(self):
        j=self.s.start('a','key',release());self.s.set(j['id'],'succeeded')
        self.assertEqual(self.s.start('a','key',release())['id'],j['id'])
        with self.assertRaises(Rejected):self.s.prior('b','key','a'*40)
    def test_persistence_restart_and_recovery(self):
        j=self.s.start('a','key',release());self.s.set(j['id'],'migrating')
        again=State(self.path,'store1');again.recover()
        self.assertEqual(again.jobs()[0]['state'],'recovery_required')
        self.assertEqual(again.start('b','next',release())['id'],j['id'])
    def test_queued_survives_restart(self):
        self.s.start('a','key',release());self.s.recover()
        self.assertEqual(self.s.jobs()[0]['state'],'queued')
    def test_reject_catalog_rollback_and_equivocation(self):
        c=catalog();self.s.catalog(c)
        for update in [dict(sequence=0),dict(expiresAt=2100)]:
            with self.assertRaises(Rejected):self.s.catalog(c|update)
    def test_reject_mutable_release(self):
        c=catalog();self.s.catalog(c);c['sequence']=2;c['releases'][0]['digest']='c'*64
        with self.assertRaises(Rejected):self.s.catalog(c)
    def test_tickets_expire_and_hash_only(self):
        with patch('update_service.state.time.time',return_value=1000):token=self.s.ticket('admin',2,'d'*64,1500)
        with self.s.db() as db:
            self.assertNotEqual(db.execute('SELECT digest FROM tickets').fetchone()[0],token)
        with patch('update_service.state.time.time',return_value=1499):self.assertEqual(self.s.ticket_actor(token)['actor'],'admin')
        with patch('update_service.state.time.time',return_value=1500):self.assertIsNone(self.s.ticket_actor(token))
    def test_rate_limit_is_durable(self):
        self.s.limit('start',1,3600)
        with self.assertRaises(Rejected):State(self.path,'store1').limit('start',1,3600)
    def test_all_interrupted_stages_fenced(self):
        for stage in ['preflight','downloading','preparing','backing_up','migrating','activating','verifying','rolling_back']:
            with self.subTest(stage=stage):
                self.s=State(Path(self.temp.name)/(stage+'.sqlite'),'store1')
                j=self.s.start('a','key',release());self.s.set(j['id'],stage);self.s.recover()
                self.assertEqual(self.s.jobs()[0]['state'],'recovery_required')

class TrustTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.p=Path(cls.temp.name)
        subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(cls.p/'private')],check=True,capture_output=True)
        subprocess.run(['openssl','pkey','-in',str(cls.p/'private'),'-pubout','-out',str(cls.p/'public')],check=True,capture_output=True)
        cls.roots={'test':(cls.p/'public').read_text()}
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def envelope(self,c):
        raw=json.dumps(c).encode();(self.p/'payload').write_bytes(raw)
        subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(self.p/'private'),'-rawin','-in',str(self.p/'payload'),'-out',str(self.p/'sig')],check=True,capture_output=True)
        return json.dumps(dict(keyId='test',payload=base64.b64encode(raw).decode(),signature=base64.b64encode((self.p/'sig').read_bytes()).decode())).encode()
    def test_valid_detached_signature(self):self.assertEqual(verify(self.envelope(catalog()),self.roots,1500),catalog())
    def test_tamper_wrong_root_and_expiry(self):
        e=json.loads(self.envelope(catalog()));e['payload']=base64.b64encode(b'{}').decode()
        with self.assertRaises(Rejected):verify(json.dumps(e).encode(),self.roots,1500)
        with self.assertRaises(Rejected):verify(self.envelope(catalog()),{},1500)
        with self.assertRaises(Rejected):verify(self.envelope(catalog()),self.roots,2000)
    def test_bad_release_contracts(self):
        for change in [{'url':'https://evil.test/app'},{'sha':'main'},{'version':'1.7.0;id'},{'minimumUpdater':0},{'size':999999999},{'dbContract':2},{'rollbackCompatible':'yes'}]:
            with self.subTest(change=change):
                c=catalog();c['releases'][0].update(change)
                with self.assertRaises(Rejected):verify(self.envelope(c),self.roots,1500)
    def test_download_checksum_failure_removes_partial(self):
        import io
        data=b'bad';out=self.p/'archive'
        class Opener:
            def open(self,*a,**k):return io.BytesIO(data)
        with patch('update_service.trust.build_opener',return_value=Opener()):
            with self.assertRaises(Rejected):download(release()['url'],out,len(data),'0'*64)
        self.assertFalse(out.exists())
    def test_redirect_ssrf(self):
        for url in ['http://github.com/x','https://127.0.0.1/x','https://evil.test/x','https://github.com:444/x','https://x@github.com/x']:
            with self.subTest(url=url), self.assertRaises(Rejected):SafeRedirect().redirect_request(None,None,302,'',{},url)

class PlanTests(unittest.TestCase):
    def test_new_install_uses_private_common_bridge_and_pinned_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'manager').mkdir()
            for name in ['updater-trust.json','single-store-updater.service']:(root/'manager'/name).write_text('fixture')
            networks=json.dumps([{'NetworkSettings':{'Networks':{'private-web':{'Gateway':'172.20.0.1'}}}}])
            with patch('core.ROOT',root),patch('core.run',return_value=networks),patch('update_service.new_install.prepare') as prepare,patch('update_service.new_install.activate') as activate:
                install_new({'installer_source':str(root/'source')})
                prepare.assert_called_once_with((root/'source').resolve(),root/'manager/updater-trust.json','172.20.0.1',installed_copy=root)
                activate.assert_called_once_with(root/'manager/single-store-updater.service')
    def test_local_fixture_does_not_activate_system_service(self):
        with patch('update_service.new_install.prepare') as prepare:
            install_new({'local_test':True});prepare.assert_not_called()
    def test_proxy_other_sites_preserved(self):
        original='https://hubify.web.id {\n  reverse_proxy app:3000\n}\nplatform.test {\n  reverse_proxy platform:8081\n}\n'
        route='  handle /api/local-updater/status { reverse_proxy 172.18.0.1:17841 }\n'
        result=add_route(original,'https://hubify.web.id',route)
        self.assertIn('platform.test {\n  reverse_proxy platform:8081\n}',result)
        with self.assertRaises(Rejected):add_route(result,'https://hubify.web.id',route)
    def test_preserves_persistent_services_and_idempotent(self):
        old={'services':{'app':{'user':'1000:1000','env_file':['/etc/single-store/runtime.env'],'volumes':['/var/lib/single-store/media:/media']},'db':{'volumes':['db:/var/lib/postgresql/data']},'proxy':{'ports':['80:80','443:443']}}}
        new,route=plan(old,'https://hubify.web.id','a'*32,'172.20.0.1')
        self.assertEqual(new['services']['db'],old['services']['db'])
        self.assertEqual(new['services']['proxy'],old['services']['proxy'])
        self.assertEqual(plan(new,'https://hubify.web.id','a'*32,'172.20.0.1')[0],new)
        self.assertIn('/api/local-updater/status',route);self.assertNotIn('/command',route)
    def test_public_bind_rejected(self):
        for address in ['0.0.0.0','43.173.41.24','127.0.0.1']:
            with self.assertRaises(Rejected):plan({},'https://hubify.web.id','a'*32,address)

class ControlSecurityTests(unittest.TestCase):
    def setUp(self):
        import time
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.p=Path(self.temp.name)
        self.c=Controller.__new__(Controller);self.c.config={'installation':'a'*32,'database':str(self.p/'state.sqlite'),'channel':'pilot'}
        self.c.state=State(self.c.config['database'],'a'*32);self.c.catalog=None;self.c.catalog_error=None;self.c.last_check=0
        self.body={'action':'status','installation':'a'*32,'actor':'admin','sessionVersion':1,'sessionHash':'b'*64,'sessionExpires':int(time.time())+3600}
    def test_control_identity_fields_and_permission(self):
        with patch('core.sql',return_value='1'),patch.object(self.c,'status',return_value={}):
            self.assertIn('statusToken',self.c.command(self.body))
            for change in [{'installation':'other'},{'actor':"x';drop table users;--"},{'sessionExpires':1},{'sessionVersion':True},{'sessionHash':'bad'},{'action':'shell'},{'url':'https://evil.test'}]:
                with self.subTest(change=change),self.assertRaises(Rejected):self.c.command(self.body|change)
        with patch('core.sql',return_value='0'),self.assertRaises(Rejected):self.c.command(self.body)
    def test_readonly_http_capability_and_revocation(self):
        from urllib.request import Request,urlopen
        from urllib.error import HTTPError
        server=StatusServer(('127.0.0.1',0),Handler);server.controller=self.c;server.readonly=True
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        token=self.c.state.ticket('admin',1,'b'*64,self.body['sessionExpires'])
        base='http://127.0.0.1:'+str(server.server_address[1])
        def request(path,token=None,method='GET'):
            headers={'Authorization':'Bearer '+token} if token else {}
            try:
                with urlopen(Request(base+path,headers=headers,method=method),timeout=3) as r:return r.status,json.load(r)
            except HTTPError as e:return e.code,json.load(e)
        try:
            with patch('core.sql',return_value='1'),patch.object(self.c,'status',return_value={'jobs':[]}):
                self.assertEqual(request('/api/local-updater/status')[0],401)
                self.assertEqual(request('/api/local-updater/status','wrong')[0],401)
                self.assertEqual(request('/api/local-updater/status',token),(200,{'jobs':[]}))
                self.assertEqual(request('/command',token,'POST')[0],404)
                self.assertEqual(request('/api/local-updater/status?token='+token)[0],404)
            with patch('core.sql',return_value='0'):
                self.assertEqual(request('/api/local-updater/status',token)[0],401)
        finally:server.shutdown();server.server_close();thread.join()

class MigrationCompatibilityTests(unittest.TestCase):
    def setUp(self):
        import io, tarfile
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.p=Path(self.temp.name);self.name='20261109120000_order_resolution_workflow'
        self.relative='app/prisma/migrations/'+self.name+'/migration.sql'
        self.old=b'CREATE TABLE "Example" ("id" TEXT);\r\n'
        self.new=self.old.replace(b'\r\n',b'\n')
        self.oldhash=hashlib.sha256(self.old).hexdigest();self.newhash=hashlib.sha256(self.new).hexdigest()
        old_path=self.p/'installed'/self.relative;old_path.parent.mkdir(parents=True);old_path.write_bytes(self.old)
        self.cfg={'baseline':str(self.p/'baseline.json'),'migrationCompatibility':str(self.p/'compat.json')}
        core.atomic_json(self.cfg['baseline'],{'root':str(self.p/'installed'),'files':{self.relative:self.oldhash}})
        core.atomic_json(self.cfg['migrationCompatibility'],{self.name:{'installed':self.oldhash,'artifact':self.newhash}})
        self.installed={'db_contract':1,'migrations':{self.name:self.oldhash}}
        files={n:b'fixture' for n in ['VERSION','app/Dockerfile','app/package-lock.json','deploy/compose.yaml','installer/core.py','installer/updater.py','update.sh','restore.sh']}
        files[self.relative]=self.new
        self.manifest={'format':1,'repository':core.REPO,'repository_id':core.REPO_ID,'version':'1.7.0','tag':'v1.7.0','source_sha':'a'*40,'migrations':{self.name:self.newhash},'compatibility':{'postgres_major':16,'db_contract':1,'minimum_installed_contract':1,'maximum_installed_contract':1,'rollback_compatible':True},'files':{n:hashlib.sha256(v).hexdigest() for n,v in files.items()}}
        files['release.json']=json.dumps(self.manifest).encode();self.archive=self.p/'release.tar.gz'
        with tarfile.open(self.archive,'w:gz') as tar:
            for name,data in files.items():
                info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))
        self.dest=self.p/'release';self.dest.mkdir()
    def test_reviewed_line_endings_preserve_database_checksum(self):
        result=extract(self.archive,self.dest,release(),self.installed,self.cfg)
        self.assertEqual((self.dest/self.relative).read_bytes(),self.old)
        self.assertEqual(result['migrations'],self.installed['migrations'])
        self.assertEqual(result['preservedMigrationBytes'][self.name]['artifact'],self.newhash)
    def test_unreviewed_and_tampered_history_rejected(self):
        for rules in [{},{self.name:{'installed':self.oldhash,'artifact':'0'*64}}]:
            core.atomic_json(self.cfg['migrationCompatibility'],rules)
            with self.assertRaises(Rejected):extract(self.archive,self.dest,release(),self.installed,self.cfg)
    def test_modified_local_sql_is_not_blessed(self):
        (self.p/'installed'/self.relative).write_bytes(self.old+b'DROP TABLE "User";')
        with self.assertRaises(Rejected):extract(self.archive,self.dest,release(),self.installed,self.cfg)
    def test_default_remains_strict(self):
        with self.assertRaises(core.StoreError):extract(self.archive,self.dest,release(),self.installed,{})

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.p=Path(self.temp.name)
        self.s=State(self.p/'state.sqlite','store1');self.job=self.s.start('a','key',release())
        self.e=Engine(self.s,{'jobs':str(self.p/'jobs'),'origin':'https://hubify.web.id','channel':'pilot','baseline':str(self.p/'baseline')})
        self.installed=dict(version='1.6.3',source_sha='d'*40,db_contract=1,migrations={'old':'hash'})
        self.old={'services':{'app':{'image':'old'},'tools':{'image':'old-tools'}}}
        (self.p/'runtime.env').write_text('APP_ORIGIN=https://hubify.web.id\n')
        self.manifest={'compatibility':{'rollback_compatible':True,'minimum_installed_version':'1.6.3','maximum_installed_version':'1.6.3'},'migrations':{'old':'hash','new':'hash2'},'files':{}}
    def execute(self,fail=None,partial=False):
        ledger=[self.installed['migrations']]
        def migrate(args,**kwargs):
            if args[0]=='run':
                ledger[0]={'old':'hash','partial':'bad'} if partial else self.manifest['migrations']
                if fail=='migrating':raise RuntimeError('secret must not escape')
        def fake_read(path):
            if str(path).endswith('version.json'):return copy.deepcopy(self.installed)
            if str(path)==str(core.COMPOSE):return copy.deepcopy(self.old)
            if str(path).endswith('operation.json'):return json.loads(Path(path).read_text())
            return {}
        from contextlib import ExitStack
        import builtins
        real_open=builtins.open
        def op(path,*a,**k):return real_open(self.p/'lock' if str(path)=='/run/single-store-operation.lock' else path,*a,**k)
        with ExitStack() as stack:
            for target,value in [('core.CONFIG',self.p),('core.ROOT',self.p),('core.COMPOSE',self.p/'compose.json'),('core.read_json',fake_read),('core.sql',lambda q:'0'),('core.healthy',lambda:None),('core.public_health',lambda *a:None),('core.dc',migrate),('core.run',lambda *a,**k:'old-image'),('update_service.engine.download',lambda *a:None),('update_service.engine.updater.extract_package',lambda *a:self.manifest),('update_service.engine.updater.backup',lambda:'backup'),('update_service.engine.updater.verify_backup',lambda *a:None),('update_service.engine.shutil.disk_usage',lambda *a:types.SimpleNamespace(free=10*1024**3)),('update_service.engine.subprocess.run',lambda *a,**k:types.SimpleNamespace(returncode=1)),('builtins.open',op)]:
                stack.enter_context(patch(target,value))
            stack.enter_context(patch.object(self.e,'ledger',lambda:ledger[0]));stack.enter_context(patch.object(self.e,'baseline',lambda:None));stack.enter_context(patch.object(self.e,'build',lambda *a:None))
            stack.enter_context(patch.object(self.e,'resources',lambda:None))
            stack.enter_context(patch.object(self.e,'verified',side_effect=RuntimeError('health') if fail=='health' else None))
            stack.enter_context(patch.object(self.e,'backup',side_effect=Rejected('backup_timeout') if fail=='backup_timeout' else RuntimeError('backup_secret') if fail=='backup' else None,return_value='backup'))
            if fail=='backup':stack.enter_context(patch('updater.backup',side_effect=RuntimeError('backup_secret')))
            if fail=='disk':stack.enter_context(patch('update_service.engine.shutil.disk_usage',return_value=types.SimpleNamespace(free=0)))
            self.e.process(self.job)
        return self.s.jobs()[0]
    def test_success(self):self.assertEqual(self.execute()['state'],'succeeded')
    def test_disk_failure_before_cutover(self):self.assertEqual(self.execute('disk')['state'],'failed')
    def test_backup_failure_fences_possible_external_work(self):self.assertEqual(self.execute('backup')['state'],'recovery_required')
    def test_backup_timeout_requires_operator_reconciliation(self):self.assertEqual(self.execute('backup_timeout')['state'],'recovery_required')
    def test_partial_migration_requires_recovery(self):self.assertEqual(self.execute('migrating',True)['state'],'recovery_required')
    def test_health_failure_rolls_back_only_code(self):self.assertEqual(self.execute('health')['state'],'rolled_back')
    def test_errors_are_redacted(self):self.assertNotIn('secret',self.execute('backup')['detail'])

if __name__=='__main__':unittest.main()


