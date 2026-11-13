"""Native worker adapter for the reviewed canonical v1.7.4 -> v1.8.0 edge.

Only called with the operation lock held. No historical byte exception is
generalized here. The old generic/staging guards are not bypassed or changed.
"""
import copy
import hashlib
import json
import re
import shutil
import subprocess
import time
from pathlib import Path
import core
import updater
import promotions_transition as transition
from .trust import Rejected
from .policy_feed import fresh

FLAGS=('JNT_PRODUCTION_API_APPROVED','JNT_PRODUCTION_ORDER_APPROVED','JNT_ENABLE_ORDER_CREATE')


def require(condition,reason):
    if not condition: raise Rejected(reason)


def schema_hash():
    # Same canonical catalog projection used in the independently reviewed v1.8.0 rehearsal.
    raw=core.sql('''SELECT json_build_object(
      'columns',(SELECT json_agg(row_to_json(c) ORDER BY table_name,ordinal_position) FROM
        (SELECT table_name,column_name,ordinal_position,is_nullable,data_type,udt_name,column_default
         FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations') c),
      'constraints',(SELECT json_agg(row_to_json(c) ORDER BY tablename,conname) FROM
        (SELECT cl.relname AS tablename,co.conname,co.contype,pg_get_constraintdef(co.oid) AS definition
         FROM pg_constraint co JOIN pg_class cl ON co.conrelid=cl.oid JOIN pg_namespace ns ON cl.relnamespace=ns.oid
         WHERE ns.nspname='public' AND cl.relname <> '_prisma_migrations') c),
      'indexes',(SELECT json_agg(row_to_json(i) ORDER BY tablename,indexname) FROM
        (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') i),
      'rls',(SELECT json_agg(row_to_json(r) ORDER BY relname) FROM
        (SELECT relname,relrowsecurity FROM pg_class cl JOIN pg_namespace ns ON cl.relnamespace=ns.oid
         WHERE ns.nspname='public' AND relkind='r' AND relname <> '_prisma_migrations') r));''')
    return transition.digest(json.dumps(json.loads(raw),sort_keys=True,separators=(',',':')).encode())


def proxy_hashes(config):
    """Only an installer-generated entire proxy file, or a root-reviewed pair."""
    hashes=config.get('approvedProxyHashes')
    if hashes:
        require(set(hashes)=={'live','maintenance'} and all(re.fullmatch('[a-f0-9]{64}',v) for v in hashes.values()),'proxy_review_required')
    else:
        from .activate import add_route
        setup=core.read_json(core.STATE)
        from .ui_route import routes
        route=routes(config)
        live=add_route(core.caddy_content(setup,True).decode(),config['origin'],route).encode()
        maintenance=add_route(core.caddy_content(setup,False).decode(),config['origin'],route).encode()
        hashes={'live':transition.digest(live),'maintenance':transition.digest(maintenance)}
    core.preserved_caddy_content(True,hashes)
    return hashes


class NativeForward:
    def __init__(self,engine,job,policy=None):
        self.e=engine;self.config=engine.config;self.job=job
        self.release=json.loads(job['release']);self.sha=self.release['sha'];self.digest=self.release['digest']
        self.folder=Path(self.config['jobs'])/job['id'];self.journal=self.folder/'forward.json'
        self.policy=policy

    def load(self): return core.read_json(self.journal) if self.journal.exists() else None
    def save(self,j):
        core.atomic_json(self.journal,j)
        phases={'prepare':'preparing','drain':'preparing','fence':'preparing','backup':'backing_up',
            'migration':'migrating','activation':'activating','readiness':'verifying','metadata':'verifying',
            'opening':'verifying','workers':'verifying','recovery_required':'recovery_required'}
        if j['phase'] in phases: self.e.mark(self.job,phases[j['phase']])

    def env(self):
        values=dict(line.split('=',1) for line in (core.CONFIG/'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
        require(values.get('APP_ORIGIN')==self.config['origin'],'installation_mismatch')
        return values
    def guards(self):
        return {str(p):transition.digest(p.read_bytes()) for p in (core.COMPOSE,core.CONFIG/'runtime.env',
            core.CONFIG/'migration.env',core.CONFIG/'Caddyfile',core.CONFIG/'updater/config.json',core.CONFIG/'version.json')}
    def immutable_guards(self,j):
        for p in (core.CONFIG/'runtime.env',core.CONFIG/'migration.env',core.CONFIG/'updater/config.json'):
            require(transition.digest(p.read_bytes())==j['guards'][str(p)],'configuration_changed')
    def ledger_rows(self):
        return json.loads(core.sql('SELECT coalesce(json_agg(to_jsonb(m) ORDER BY migration_name),\'[]\') FROM "_prisma_migrations" m;'))
    def carrier_idle(self):
        return core.sql('SELECT count(*) FROM "JntShipmentRequest" WHERE state IN (\'PREPARED\',\'DISPATCHED\',\'UNKNOWN\');')=='0'
    def baseline(self):
        self.e.baseline()
        baseline=core.read_json(self.config['baseline'])
        for name,digest in self.policy['baselineFiles'].items():
            require(baseline['files'].get(name)==digest,'local_customization')
        # Verify actual running source bytes, not just version environment variables.
        js="""const fs=require('fs'),c=require('crypto');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const out={};for(const p of JSON.parse(s)){try{out[p]=c.createHash('sha256').update(fs.readFileSync('/app/'+p.slice(4))).digest('hex')}catch{out[p]=null}}console.log(JSON.stringify(out))});"""
        observed=json.loads(core.dc(['exec','-T','app','node','-e',js],input=json.dumps(list(self.policy['baselineFiles'])).encode()))
        require(observed==self.policy['baselineFiles'],'active_source_mismatch')
        installed=core.read_json(core.CONFIG/'version.json')
        item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
        env=dict(v.split('=',1) for v in item['Config']['Env'] if '=' in v)
        require(env.get('STORE_BUILD_SHA')==installed['source_sha'] and env.get('STORE_INSTALLED_VERSION')==installed['version']
            and env.get('APP_ORIGIN')==self.config['origin'] and env.get('STORE_INSTALLATION_ID')==self.config['installation']
            and env.get('STORE_UPDATER_ENABLED')=='1','active_version_mismatch')
        if installed.get('image_digest'):require(item['Image']==installed['image_digest'],'active_version_mismatch')

    def preflight(self,inspect_only=False):
        installed=core.read_json(core.CONFIG/'version.json')
        if not inspect_only:
            self.policy=fresh(self.config,self.e.state,self.release,installed)
        require(self.policy['fromSourceSha']==transition.BASE_RELEASE_SOURCE and self.policy['baselineAppTree']==transition.BASE_TREE
            and self.policy['baselineSchemaHash']==transition.BASE_SCHEMA,'policy_baseline_mismatch')
        require(self.release['rollbackCompatible'] is False and self.release['dbContract']==1,'policy_recovery')
        require(160000<=int(core.sql('SHOW server_version_num;'))<170000,'postgres_version_unsupported')
        require(self.e.ledger()==self.policy['beforeMigrations']==installed['migrations'],'migration_history')
        require(len(self.ledger_rows())==29 and all(r['finished_at'] and not r['rolled_back_at'] for r in self.ledger_rows()),'migration_history')
        require(schema_hash()==self.policy['baselineSchemaHash'],'schema_drift')
        env=self.env()
        # Published v1.7.4/v1.8.0 provider webhooks are acknowledgement-only.
        # Never claim safe durable payment replay for an unimplemented provider.
        require(env.get('PAYMENT_PROVIDER','manual')=='manual','payment_webhook_not_supported')
        self.baseline();core.healthy()
        self.e.resources()
        persistent=int(core.sql("SELECT pg_database_size('store');"))
        persistent+=sum(p.stat().st_size for root in (core.DATA/'media',core.CONFIG) for p in root.rglob('*') if p.is_file())
        require(shutil.disk_usage(core.ROOT).free >= (2 if self.load() else 6)*1024**3+2*persistent,'insufficient_disk')
        require(self.carrier_idle(),'carrier_work_pending')
        hashes=proxy_hashes(self.config)
        report={'installed':installed,'guards':self.guards(),'flags':{k:env.get(k) for k in FLAGS},'proxy':hashes}
        if inspect_only: return report
        self.manifest,self.files=transition.package(self.folder/'release.tar.gz',self.digest,self.sha,self.release['version'])
        expected={'db_contract':1,'minimum_installed_contract':1,'maximum_installed_contract':1,'postgres_major':16,
            'rollback_compatible':False,'minimum_installed_version':'1.7.4','maximum_installed_version':'1.7.4'}
        require(self.manifest['compatibility']==expected and self.manifest['migrations']==self.policy['afterMigrations'],'manifest_compatibility')
        require(set(self.policy['afterMigrations'])-set(self.policy['beforeMigrations'])=={transition.NEW_NAME}
            and self.policy['afterMigrations'][transition.NEW_NAME]==transition.NEW_SQL,'migration_history')
        return report

    def initial(self,report):
        old=core.read_json(core.COMPOSE)
        old['services']['app']['image']=core.run(['docker','inspect','--format','{{.Image}}',core.dc(['ps','-q','app'])])
        return {**report,'sha':self.sha,'digest':self.digest,'installation':self.config['installation'],
            'old_compose':old,'manifest':self.manifest,'policy':self.policy,'phase':'initial',
            'migration_started':False,'timer':self.active('single-store-maintenance.timer')}
    def active(self,unit): return subprocess.run(['systemctl','is-active','--quiet',unit],stdout=subprocess.DEVNULL).returncode==0
    def external(self,kind,action):
        self.e.pending(self.folder,kind)
        result=action();self.e.settled(self.folder);return result
    def prepare(self,j):
        source=self.folder/'release';source.mkdir(mode=0o755,exist_ok=False)
        for name,data in self.files.items():
            path=source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);path.chmod(0o644)
        core.atomic_json(source/'release.json',self.manifest)
        candidate=copy.deepcopy(j['old_compose'])
        for name,target in [('tools','tools'),('app','runtime')]:
            image='single-store-'+name+':update-'+self.job['id']
            candidate['services'][name].update(image=image,build={'context':str(source/'app'),'target':target})
            self.external('build',lambda: self.e.build(source,image,target))
        candidate['services']['app'].setdefault('environment',{}).update(STORE_INSTALLED_VERSION=self.release['version'],STORE_BUILD_SHA=self.sha,STORE_UPDATE_CHANNEL=self.config['channel'])
        j['candidate']=candidate;j['image']=core.run(['docker','image','inspect','--format','{{.Id}}',candidate['services']['app']['image']])
        core.atomic_json(self.folder/'compose.json',candidate)

    def drain(self,j):
        require(self.guards()==j['guards'],'configuration_changed')
        core.run(['systemctl','stop','single-store-maintenance.timer'])
        deadline=time.monotonic()+180
        while self.active('single-store-maintenance.service'):
            require(time.monotonic()<deadline,'maintenance_busy');time.sleep(1)
    def proxy(self,j,live):
        from .activate import validate_proxy,write_proxy
        content=core.preserved_caddy_content(live,j['proxy']).decode()
        # Never start/recreate the app as an implicit proxy dependency, especially
        # after SQL succeeded but the candidate has not yet been activated.
        core.dc(['up','-d','--no-deps','--no-build','--pull','never','proxy'])
        validate_proxy(content);write_proxy(content)
    def sockets_idle(self):
        # A pending inbound HTTP request or outbound carrier/payment connection
        # is not proof of completion. Exclude only persistent PostgreSQL sockets.
        js="""const f=require('fs');let n=0;for(const p of ['/proc/net/tcp','/proc/net/tcp6'])for(const l of f.readFileSync(p,'utf8').trim().split('\\n').slice(1)){const a=l.trim().split(/\\s+/);if(a[3]==='01'&& !a[2].endsWith(':1538'))n++}console.log(n);"""
        return core.dc(['exec','-T','app','node','-e',js])=='0'
    def fence(self,j,capture_snapshot=True):
        self.proxy(j,False)
        deadline=time.monotonic()+180;stable=0
        while stable<3:
            require(time.monotonic()<deadline,'active_requests_pending')
            stable=stable+1 if self.carrier_idle() and self.sockets_idle() else 0
            time.sleep(2)
        core.dc(['stop','-t','90','app'],timeout=120)
        require(self.carrier_idle(),'carrier_work_pending')
        require(core.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='store' AND pid<>pg_backend_pid() AND usename IN ('store_app','store_owner');")=='0','database_writer_pending')
        if capture_snapshot:j['before_ledger']=self.ledger_rows();j['before_data']=self.data_snapshot()
    def data_snapshot(self):
        result={}
        names=json.loads(core.sql("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','FlashSaleSkuOffer');"))
        for name in names:
            require(re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,62}',name) is not None,'schema_drift')
            minus="-'draft'" if name=='FlashSaleCampaign' else "-'flashOfferId'" if name=='OrderItem' else ''
            # Hash each row inside PostgreSQL; no customer/config payload leaves
            # the DB and large JSON rows are not aggregated in worker memory.
            raw=core.sql('SELECT count(*)::text||\':\'||coalesce(string_agg(h,\'\' ORDER BY h),\'\') FROM '
                '(SELECT encode(sha256(convert_to((to_jsonb(t)'+minus+')::text,\'UTF8\')),\'hex\') h FROM "'+name+'" t) s;')
            result[name]=transition.digest(raw.encode())
        return result
    def backup_and_restore_verify(self,j):
        j['backup']=self.external('backup',lambda: self.e.backup(self.folder));j['backup_verified']=True
        self.save(j)
    def database_state(self,j):
        rows=self.ledger_rows()
        if len(rows)!=len({r['migration_name'] for r in rows}) or any(not r['finished_at'] or r['rolled_back_at'] for r in rows): return 'uncertain'
        ledger={r['migration_name']:r['checksum'] for r in rows}
        return 'new' if ledger==j['policy']['afterMigrations'] else 'old' if ledger==j['policy']['beforeMigrations'] else 'uncertain'
    def migrate(self,j):
        require(j.get('backup_verified') and self.database_state(j)=='old','migration_history')
        self.external('migration',lambda: core.dc(['run','--rm','-T','--no-deps','--name','single-store-migrate-'+self.job['id'],'tools','npm','run','db:migrate'],file=self.folder/'compose.json',timeout=300))
        core.grant_runtime()
    def verify_migration(self,j):
        require(self.database_state(j)=='new','migration_verification')
        if not j.get('traffic_may_have_opened'):
            require([r for r in self.ledger_rows() if r['migration_name']!=transition.NEW_NAME]==j['before_ledger'],'migration_history')
            require(self.data_snapshot()==j['before_data'],'transaction_history_changed')
            require(core.sql('SELECT count(*) FROM "FlashSaleSkuOffer";')=='0','unexpected_promotion_activation')
    def activate(self,j):
        self.immutable_guards(j)
        core.grant_runtime();core.atomic_json(core.COMPOSE,j['candidate'])
        self.external('activation',lambda: core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app'],timeout=180))
    def verify_active(self,j):
        self.immutable_guards(j)
        require(self.database_state(j)=='new','migration_history');core.healthy()
        item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
        env=dict(v.split('=',1) for v in item['Config']['Env'] if '=' in v)
        require(item['Image']==j['image'] and env.get('STORE_BUILD_SHA')==self.sha and env.get('STORE_INSTALLED_VERSION')==self.release['version'],'active_version_mismatch')
        require({k:env.get(k) for k in FLAGS}==j['flags']=={k:self.env().get(k) for k in FLAGS},'production_guards_changed')
        # Auth-independent readiness works on new shops without customer accounts.
        value=json.loads(core.run(['curl','--fail','--silent','--max-time','20','http://127.0.0.1:3000/api/v1/ready']))
        require(isinstance(value,dict) and value.get('success') is True,'readiness_failed')
    def metadata(self,j):
        self.verify_migration(j)
        core.atomic_json(core.CONFIG/'version.json',{**j['installed'],'version':self.release['version'],'source_sha':self.sha,
            'migrations':j['policy']['afterMigrations'],'artifact_sha256':self.digest,'image_digest':j['image'],'channel':self.config['channel']})
        core.atomic_json(self.config['baseline'],{'root':str(self.folder/'release'),'files':j['manifest']['files']})
    def open_traffic(self,j):self.immutable_guards(j);self.proxy(j,True);core.public_health(core.read_json(core.STATE))
    def resume_workers(self,j):
        self.immutable_guards(j)
        if j['timer']: core.run(['systemctl','start','single-store-maintenance.timer'])
    def verify_identity(self,j):
        require((j['sha'],j['digest'],j['installation'])==(self.sha,self.digest,self.config['installation']),'installation_mismatch')
        policy=fresh(self.config,self.e.state,self.release,j['installed'])
        ignored={'issuedAt','expiresAt','sequence'}
        require({k:v for k,v in policy.items() if k not in ignored}=={k:v for k,v in j['policy'].items() if k not in ignored},'policy_changed_requires_review')
    def external_work_stopped(self,j):
        require('single-store-migrate-'+self.job['id'] not in core.run(['docker','ps','--format','{{.Names}}']).splitlines(),'migration_running')
        require(not (self.folder/'external-work.json').exists(),'external_work_review_required')
    def rollback_before_migration(self,j):
        require(not j.get('migration_started') and self.database_state(j)=='old','unsafe_rollback')
        core.atomic_json(core.COMPOSE,j['old_compose'])
        core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app'])
        core.healthy();self.open_traffic(j);self.resume_workers(j)
