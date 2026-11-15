"""Reviewed Hubify-only schema35 unchanged v1.9.0 -> v1.9.1 continuation of the official cutover.

Canonical public upgrade remains separate. This exact installation retains its
two independently proven legacy CRLF ledger entries; no file/ledger is changed.
"""
import base64,copy,json,os,shutil,time
from pathlib import Path
import core,promotions_cutover as official,promotions_transition as package
import payment_test_cutover as previous
from blu_checkout_cutover import Native as BluNative
from update_service.native_forward import NativeForward,schema_hash
BASE_SOURCE='504be3a85591dce293ef3f687504137d27d4fce2'
BASE_TREE='1835b8540e6dba8ad945f9d2c5308ff049335fb0'
BASE_SCHEMA=AFTER_SCHEMA='882d3a6ecc33a66a68502e630fb7d401eabf3d86828fc0ac5d570ced5ed2f78f'
BASE_ARCHIVE='5f0844668a3e696ee792fa522d76d4eff21165986739c83c1937ea69ab2b5471'
OMIT={}
from update_service.worker_upgrade import files_digest,inventory
check=official.check
class Native(previous.Native):
    base_sha,base_digest,base_image,base_tree=BASE_SOURCE,BASE_ARCHIVE,'sha256:f4dda33da2e643da3dc47fbd96e2bad79dc86e67d20f8e36a1385b93b0250963',BASE_TREE
    previous_receipt='hubify-midtrans-cutover.json'
    journal_name='hubify-midtrans-patch-cutover.json'
    deployment_name='hubify-midtrans-v191'
    new_tables=()
    snapshot_omit=OMIT
    prepared_images=None
    prepared_image=BluNative.prepared_image
    data_snapshot=NativeForward.data_snapshot
    def __init__(self,repository,archive,digest,sha,baseline):
        official.Native.__init__(self,repository,archive,digest,sha,baseline)
        self.folder=core.ROOT/'releases'/('hubify-midtrans-patch-'+sha[:12]+'-'+digest[:12]);self.journal_path=core.CONFIG/self.journal_name
        self.private=core.CONFIG/'payment-evidence'
        self.old_manifest,self.old_files=package.package(baseline,self.base_digest,self.base_sha,'1.9.0')
        self.manifest,self.files=package.package(archive,digest,sha,'1.9.1')
        official.verify_git_package(self.repository,sha,self.manifest,self.files,expected_tree=core.run(['git','-C',str(self.repository),'rev-parse',sha+':app']))
        check(len(self.old_manifest['migrations'])==35 and self.manifest['migrations']==self.old_manifest['migrations'],'exact unchanged schema35')
        for name in self.old_manifest['migrations']:
            p='app/prisma/migrations/'+name+'/migration.sql';check(self.old_files[p]==self.files[p],'historical SQL changed')
        check(self.old_files['app/prisma/migrations/migration_lock.toml']==self.files['app/prisma/migrations/migration_lock.toml'],'migration provider changed')
        check(self.manifest['compatibility']==dict(db_contract=1,minimum_installed_contract=1,maximum_installed_contract=1,postgres_major=16,rollback_compatible=True,minimum_installed_version='1.9.0',maximum_installed_version='1.9.0'),'manifest compatibility')
    def preflight(self,own_journal=False):
        check(os.geteuid()==0,'root operator required');self.worker_idle();check(self.carrier_idle(),'carrier operation pending')
        for name in ('hubify-promotions-cutover.json','hubify-payment-evidence-cutover.json','hubify-payment-test-cutover.json','hubify-blu-auth-cutover.json','hubify-blu-auth-retry-cutover.json','hubify-blu-checkout-cutover.json','hubify-payment-live-cutover.json','hubify-midtrans-cutover.json'):
            p=core.CONFIG/name;check(p.is_file() and core.read_json(p)['phase'] in ('complete','rolled_back'),'prior intent unresolved')
        prior=self.load();check(not prior or (own_journal and prior['phase']=='build_done' and prior['sha']==self.sha and prior['digest']==self.digest),'existing intent requires reconcile')
        receipt=core.read_json(core.CONFIG/self.previous_receipt)
        check(receipt['phase']=='complete' and receipt['sha']==self.base_sha and receipt['digest']==self.base_digest and receipt['image']==self.base_image,'previous completed release receipt')
        worker=core.read_json(core.CONFIG/'updater/worker-upgrade.json')
        check(worker.get('phase')=='complete' and worker.get('applied') is True and worker.get('sourceSha')==self.sha,'reviewed canonical worker revision required')
        expected={p:package.digest(b) for p,b in inventory(self.repository,self.sha).items()}
        check(files_digest(core.ROOT/'updater')==worker['afterFiles']==expected,'worker source bytes')
        check(b"'hubify-midtrans-patch-cutover.json'" in (core.ROOT/'updater/update_service/engine.py').read_bytes(),'worker recovery guard required')
        bundle=self.observe();obs=bundle['observation'];installed=obs['version']
        check(bundle['context']=={'installation':previous.pilot.history.INSTALLATION,'origin':'https://hubify.web.id'},'exact Hubify installation')
        check((installed['version'],installed['source_sha'],installed['artifact_sha256'],installed['image_digest'])==('1.9.0',self.base_sha,self.base_digest,self.base_image),'active baseline metadata')
        check(obs['source_commit']==self.base_sha and obs['app_tree']==self.base_tree and obs['source_inventory']==self.old_manifest['migrations'],'source baseline')
        apps=[c for c in obs['containers'] if c['service']=='app'];check(len(apps)==1 and apps[0]['image']==self.base_image and apps[0]['running'] and apps[0]['health']=='healthy','baseline health/image')
        paths=package.runtime_paths(self.old_files)
        check(set(bundle['runtime'])==paths and all(bundle['runtime'][p].get('sha256')==package.digest(self.old_files[p]) for p in paths),'runtime baseline bytes')
        expected_ledger=dict(self.old_manifest['migrations'])
        for name,(legacy,canonical) in previous.pilot.history.PAIRS.items():
            p='app/prisma/migrations/'+name+'/migration.sql';record=obs['historical_files'][name]
            original=base64.b64decode(record['original']['base64'],validate=True);active=base64.b64decode(record['active']['base64'],validate=True)
            check(package.digest(original)==legacy and package.digest(self.old_files[p])==canonical and active==self.old_files[p] and original.replace(b'\r\n',b'\n')==active,'exact historical byte proof')
            expected_ledger[name]=legacy
        rows=self.ledger_rows()
        check(len(rows)==35 and all(r['finished_at'] and not r['rolled_back_at'] for r in rows) and {r['migration_name']:r['checksum'] for r in rows}==expected_ledger==installed['migrations'],'exact existing ledger')
        check(schema_hash()==BASE_SCHEMA,'schema drift');check(self.flags()=={k:'yes' for k in official.FLAGS},'Production approvals changed')
        self.check_runtime(self.base_sha,self.base_image);core.preserved_caddy_content(True,self.proxy_hashes)
        from update_service.engine import Engine
        Engine(None,{}).resources()
        prepared=self.prepared_image()
        if not prepared and not own_journal:Engine(None,{}).build_resources()
        if own_journal:
            for name in ('app','tools'):check(core.run(['docker','image','inspect','--format','{{.Id}}',prior['candidate']['services'][name]['image']]).startswith('sha256:'),'prepared image missing')
        persistent=int(core.sql("SELECT pg_database_size('store');"))+sum(p.stat().st_size for root in (core.DATA/'media',core.CONFIG) for p in root.rglob('*') if p.is_file())
        check(shutil.disk_usage(core.ROOT).free>=official.disk_budget(persistent,images_prepared=bool(prepared) or own_journal),'insufficient safe disk budget')
        self.bundle=bundle
        return dict(transition_accepted=True,production_mutations=False,source_sha=self.sha,digest=self.digest,guards=self.file_guards(),before_migrations=35,after_migrations=35)
    def prepare(self,j):
        from update_service.engine import Engine
        self.folder.mkdir(mode=0o700,exist_ok=False);source=self.folder/'source';source.mkdir(mode=0o755)
        for name,data in self.files.items():
            p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o644)
        core.atomic_json(source/'release.json',self.manifest)
        core.atomic_json(source/'.hubify-provenance.json',dict(source_sha=self.sha,app_tree=core.run(['git','-C',str(self.repository),'rev-parse',self.sha+':app']),archive_sha256=self.digest))
        candidate=copy.deepcopy(j['old_compose'])
        for name,target in (('app','runtime'),('tools','tools')):
            image=self.prepared_images[name] if self.prepared_images else 'single-store-'+name+':hubify-midtrans-patch-'+self.sha[:12]
            if not self.prepared_images:Engine(None,{}).build(source,image,target)
            candidate['services'][name].update(image=image,build={'context':str(source/'app'),'target':target})
        candidate['services']['app'].setdefault('environment',{}).update(STORE_INSTALLED_VERSION='1.9.1',STORE_BUILD_SHA=self.sha,)
        from update_service.midtrans_runtime import ensure_key
        ensure_key(candidate)
        j['candidate']=candidate;j['image']=core.run(['docker','image','inspect','--format','{{.Id}}',candidate['services']['app']['image']]);core.atomic_json(self.folder/'compose.json',candidate)
    def drain(self,j):
        # The reviewed worker was installed atomically before this cutover and
        # already contains the recovery guard. Do not patch either worker copy.
        check(self.file_guards()==j['guards'],'configuration changed before drain')
        core.run(['systemctl','stop','single-store-updater.service']);self.worker_idle()
        core.run(['systemctl','stop','single-store-maintenance.timer'])
        deadline=time.monotonic()+180
        while self.active('single-store-maintenance.service'):
            check(time.monotonic()<deadline,'in-flight maintenance/carrier work; not killed');time.sleep(1)
    def fence(self,j):
        check(self.flags()==j['flags'],'Production approvals changed')
        core.write_caddy(core.read_json(core.STATE),live=False,preserve_extra_sites=True,approved_proxy_hashes=self.proxy_hashes)
        deadline=time.monotonic()+180;stable=0
        while stable<3:
            check(time.monotonic()<deadline,'in-flight requests/carrier work; not killed')
            stable=stable+1 if self.carrier_idle() and NativeForward.sockets_idle(self) else 0;time.sleep(2)
        core.dc(['stop','-t','90','app'],timeout=120)
        check(self.carrier_idle(),'carrier mutation pending after drain')
        check(core.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='store' AND pid<>pg_backend_pid() AND usename IN ('store_app','store_owner');")=='0','database writer connected')
        j['before_ledger']=self.ledger_rows();j['before_data']=self.data_snapshot()
    rollback_before_migration=official.Native.rollback_before_migration
    def check_runtime(self,sha,image):
        item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0];env=dict(x.split('=',1) for x in item['Config']['Env'] if '=' in x)
        check(item['Image']==image and env.get('STORE_BUILD_SHA')==sha and env.get('STORE_INSTALLED_VERSION')==('1.9.0' if sha==self.base_sha else '1.9.1'),'runtime version/source/image')
        check(env.get('STORE_INSTALLATION_ID')==previous.pilot.history.INSTALLATION and env.get('PAYMENT_PROVIDER','manual')=='manual' and all(env.get(k)=='yes' for k in official.FLAGS),'installation/provider/J&T guards')
        if sha!=self.base_sha:check(env.get('PAYMENT_GOPAY_CHECKOUT_ENABLED')=='true','QRIS runtime capability')
    def ledger_valid(self,j):
        rows=self.ledger_rows();return len(rows)==35 and all(r['finished_at'] and not r['rolled_back_at'] for r in rows) and {r['migration_name']:r['checksum'] for r in rows}==j['from']['migrations']
    database_state=previous.Native.database_state
    def expected_ledger(self,j):return j['from']['migrations']
    def migrate(self,j):
        # Official stage is a verified no-op: this patch adds no SQL.
        check(j.get('backup_verified') and self.database_state(j)=='new','verified backup and unchanged ledger required')
        self.verify_migration(j)
    def verify_migration(self,j):
        check(self.database_state(j)=='new' and schema_hash()==AFTER_SCHEMA,'unchanged schema35 verification')
        if not j.get('traffic_may_have_opened'):
            check(self.ledger_rows()==j['before_ledger'],'historical ledger changed')
            check(self.data_snapshot()==j['before_data'],'existing data changed')
    def verify_active(self,j):
        previous.Native.verify_active(self,j);check(schema_hash()==AFTER_SCHEMA,'active schema drift')
    def metadata(self,j):
        if not j.get('traffic_may_have_opened'):self.verify_migration(j)
        cfg=core.read_json(core.CONFIG/'updater/config.json');core.atomic_json(cfg['baseline'],dict(root=str(self.folder/'source'),files=self.manifest['files']))
        core.atomic_json(core.CONFIG/'version.json',{**j['from'],'version':'1.9.1','candidate_version':'1.9.1','channel':cfg['channel'],'source_sha':self.sha,'migrations':self.expected_ledger(j),'artifact_sha256':self.digest,'image_digest':j['image'],'deployment':self.deployment_name,'previous_source_sha':self.base_sha})
    def external_stopped(self,j):
        super().external_stopped(j)
        check('single-store-midtrans-migrate-'+self.sha[:12] not in core.run(['docker','ps','--format','{{.Names}}']).splitlines(),'migration still running')
