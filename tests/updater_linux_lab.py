"""Explicit disposable lab on the user-designated Linux test VPS only.

Clones DB/media read-only from the existing v1.7.4 store into a separate Docker
project and internal networks. Never resets, seeds or migrates the source store.
Test signing keys/catalog transport and port/unit remapping are isolated here;
the production Controller, Engine, NativeForward, backup/migrate code execute.
"""
import argparse
import fcntl
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import subprocess
import sys
import threading
import time
from unittest.mock import patch

REPO=Path(__file__).resolve().parents[1]
if 'core' not in sys.modules:sys.path.insert(0,str(REPO/'installer'))
import core
import updater
from update_service.policy_operator import prepare as policy_prepare, sign, TARGET_SHA, TARGET_DIGEST
from update_service.trust import verify
from update_service.policy_feed import authorized
from update_service.state import State
from update_service.server import Controller, Handler, UnixServer, StatusServer
from update_service.native_forward import NativeForward
from update_service.forward_cutover import ForwardCutover

BASE=Path('/opt/updater-lab')


def command(args,data=None):
    result=subprocess.run([str(a) for a in args],input=data,capture_output=True,timeout=180)
    if result.returncode:raise RuntimeError('Isolated lab command failed: '+str(args[0]))
    return result.stdout.decode().strip()


def prepare(case, empty=False, official=False):
    root=BASE/case
    if root.exists():raise RuntimeError('Case already exists; use a new case id')
    root.mkdir(mode=0o700)
    from promotions_transition import package, BASE_ARCHIVE, BASE_RELEASE_SOURCE
    old=Path('/tmp/updater-baseline-v174.tar.gz');new=Path('/tmp/updater-target-v180.tar.gz')
    old_manifest,files=package(old,BASE_ARCHIVE,BASE_RELEASE_SOURCE,'1.7.4')
    package(new,TARGET_DIGEST,TARGET_SHA,'1.8.0')
    source=root/'baseline';source.mkdir()
    for name,data in files.items():
        p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        if name.startswith('installer/') and name.endswith('.py'):
            worker=root/'updater'/name.removeprefix('installer/');worker.parent.mkdir(parents=True,exist_ok=True);worker.write_bytes(data)
    (source/'release.json').write_text(json.dumps(old_manifest))
    config=root/'etc';config.mkdir();(config/'updater').mkdir()
    original=json.loads(Path('/opt/single-store/deploy/compose.yaml').read_text())
    compose=copy.deepcopy(original);compose['name']='updater-lab-'+case
    compose['networks']={name:{'internal':True} for name in ('database','web')}
    compose.pop('volumes',None)
    for key in ('app','tools'):
        compose['services'][key]['build']={'context':str(source/'app'),'target':'runtime' if key=='app' else 'tools'}
        compose['services'][key].pop('container_name',None)
        if empty:compose['services'][key]['image']='updater-pilot-'+case+':'+key
    runtime=dict(line.split('=',1) for line in Path('/etc/single-store/runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    identity=secrets.token_hex(16);password=secrets.token_hex(24)
    runtime.update(APP_ORIGIN='http://127.0.0.1:3198',DATABASE_URL='postgresql://store_app:'+password+'@db:5432/store?schema=public',
        STORE_UPDATER_ENABLED='1',STORE_INSTALLATION_ID=identity)
    (config/'runtime.env').write_text('\n'.join(k+'='+v for k,v in runtime.items())+'\n')
    (config/'migration.env').write_text('DATABASE_URL=postgresql://store_owner:'+password+'@db:5432/store?schema=public\nDIRECT_URL=postgresql://store_owner:'+password+'@db:5432/store?schema=public\n')
    (config/'db.env').write_text('POSTGRES_PASSWORD='+secrets.token_hex(24)+'\nPOSTGRES_DB=store\n')
    data=root/'data';data.mkdir();shutil.copytree('/var/lib/single-store/media',data/'media',symlinks=True)
    for p in [data/'media',*(data/'media').rglob('*')]:os.chown(p,1000,1000,follow_symlinks=False)
    (root/'run').mkdir();(data/'jobs').mkdir()
    token=config/'updater/control-token';token.write_text(secrets.token_urlsafe(32));token.chmod(0o640);os.chown(token,0,1000)
    compose['services']['app'].update(ports=['127.0.0.1:3108:3000'],env_file=[str(config/'runtime.env')],volumes=[str(data/'media')+':/media',str(root/'run')+':/run/store-updater:ro',str(token)+':/run/store-updater-token:ro'])
    compose['services']['app'].setdefault('environment',{}).update(STORE_INSTALLED_VERSION='1.7.4',STORE_BUILD_SHA=BASE_RELEASE_SOURCE,STORE_UPDATER_ENABLED='1',STORE_INSTALLATION_ID=identity)
    compose['services']['tools']['env_file']=[str(config/'migration.env')]
    compose['services']['db'].update(env_file=[str(config/'db.env')],volumes=[str(data/'postgres')+':/var/lib/postgresql/data'])
    compose['services']['proxy'].update(ports=['127.0.0.1:3088:80'],volumes=[str(config/'Caddyfile')+':/etc/caddy/Caddyfile:ro'])
    compose_path=root/'compose.json';compose_path.write_text(json.dumps(compose))
    dc=['docker','compose','-f',str(compose_path)]
    command(dc+['up','-d','--no-build','--wait','db'])
    role_sql="CREATE ROLE store_owner LOGIN PASSWORD '"+password+"';CREATE ROLE store_app LOGIN BYPASSRLS PASSWORD '"+password+"';ALTER DATABASE store OWNER TO store_owner;"
    command(dc+['exec','-T','db','psql','-U','postgres','-d','store','-v','ON_ERROR_STOP=1'],role_sql.encode())
    if empty:
        # A newly created disposable DB: official 29 migrations and bootstrap,
        # never clone/downgrade the current QA store's 30-migration database.
        result=subprocess.run(dc+['build','app','tools'],stdout=(root/'build.log').open('wb'),stderr=subprocess.STDOUT,timeout=1800)
        if result.returncode:raise RuntimeError('Pilot baseline build failed')
        command(dc+['run','--rm','-T','tools','npm','run','db:migrate'])
        bootstrap=('Isolated public-catalog pilot\0pilot-bootstrap@example.invalid\0'+secrets.token_urlsafe(28)).encode()
        command(dc+['run','--rm','-T','tools','npm','run','bootstrap'],bootstrap)
        grants='GRANT USAGE ON SCHEMA public TO store_app;GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO store_app;REVOKE ALL ON TABLE "_prisma_migrations" FROM store_app;GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO store_app;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO store_app;ALTER DEFAULT PRIVILEGES FOR ROLE store_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO store_app;ALTER DEFAULT PRIVILEGES FOR ROLE store_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO store_app;'
        command(dc+['exec','-T','db','psql','-U','postgres','-d','store','-v','ON_ERROR_STOP=1'],grants.encode())
    else:
        dump=root/'baseline.dump'
        with dump.open('wb') as output:
            result=subprocess.run(['docker','exec','single-store-db-1','pg_dump','-U','postgres','-d','store','-Fc'],stdout=output,stderr=subprocess.DEVNULL)
            if result.returncode:raise RuntimeError('Read-only source dump failed')
        with dump.open('rb') as inp:
            result=subprocess.run(dc+['exec','-T','db','pg_restore','-U','postgres','-d','store','--exit-on-error'],stdin=inp,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if result.returncode:raise RuntimeError('Isolated clone restore failed')
        # Fixture factory ONLY. pg_restore rewrites four varchar IN predicates into
        # equivalent explicit text casts. Recreate those constraints atomically from
        # the authenticated original SQL, preserving every ledger/data row. Native
        # upgrade code does not normalize schemas or permit this restored variant.
        specs=[('20261029090000_flash_sale_campaign','FlashSaleCampaign','FlashSaleCampaign_status_check','status'),
            ('20261031110000_jnt_platform_integration','JntIntegration','JntIntegration_environment_check','environment'),
            ('20261031123000_jnt_l3_and_awb_ledger','JntL3Mapping','JntL3Mapping_status_check','matchStatus'),
            ('20261031123000_jnt_l3_and_awb_ledger','JntShipmentRequest','JntShipmentRequest_state_check','state')]
        statements=[]
        for migration,table,constraint,column in specs:
            sql=files['app/prisma/migrations/'+migration+'/migration.sql'].decode()
            match=re.search(r'CHECK \(("'+column+r'" IN \([^)]*\))\)',sql)
            if not match:raise RuntimeError('Authenticated fixture predicate missing')
            statements.append('ALTER TABLE "'+table+'" DROP CONSTRAINT "'+constraint+'", ADD CONSTRAINT "'+constraint+'" CHECK ('+match[1]+');')
        command(dc+['exec','-T','db','psql','-U','postgres','-d','store','-v','ON_ERROR_STOP=1'],('BEGIN;\n'+'\n'.join(statements)+'\nCOMMIT;').encode())
    credentials={'password':secrets.token_urlsafe(24),'admin':'updater-admin-'+case+'@example.invalid','customer':'updater-buyer-'+case+'@example.invalid'}
    js="""const P=require('@prisma/client').PrismaClient,p=new P(),b=require('bcryptjs');let raw='';process.stdin.on('data',v=>raw+=v);process.stdin.on('end',async()=>{try{const x=JSON.parse(raw);for(const kind of ['admin','customer']){const role=await p.role.findUniqueOrThrow({where:{name:kind==='admin'?'Admin':'Customer'}});await p.user.create({data:{name:'Isolated updater '+kind,email:x[kind],passwordHash:await b.hash(x.password,10),emailVerifiedAt:new Date(),roles:{create:{roleId:role.id}},customer:{create:{fullName:'Isolated updater '+kind}}}})}await p.$disconnect()}catch{process.exit(1)}});"""
    command(dc+['run','--rm','-T','--no-deps','tools','node','-e',js],json.dumps(credentials).encode())
    (root/'browser-creds.json').write_text(json.dumps(credentials));(root/'browser-creds.json').chmod(0o600)
    # Creating the web network without publishing any source service.
    network='updater-lab-'+case+'_web'
    command(['docker','network','create','--internal','--label','com.docker.compose.project=updater-lab-'+case,'--label','com.docker.compose.network=web',network])
    gateway=json.loads(command(['docker','network','inspect',network]))[0]['IPAM']['Config'][0]['Gateway']
    live=(runtime['APP_ORIGIN']+' {\n  handle /api/local-updater/status {\n    reverse_proxy '+gateway+':17842\n  }\n  handle {\n    reverse_proxy app:3000\n  }\n}\nhttp://unrelated-lab.invalid {\n respond "unchanged" 200\n}\n').encode()
    maintenance=live.replace(b'reverse_proxy app:3000',b'respond "Toko sedang disiapkan oleh pemilik server." 503')
    (config/'Caddyfile').write_bytes(live)
    (config/'version.json').write_text(json.dumps({'version':'1.7.4','source_sha':BASE_RELEASE_SOURCE,'db_contract':1,'migrations':old_manifest['migrations']}))
    (config/'setup.json').write_text(json.dumps({'domain':'updater-lab.invalid','proof':'lab-only','local_test':True}))
    (config/'updater/baseline.json').write_text(json.dumps({'root':str(source),'files':old_manifest['files']}))
    key=root/'test-key.pem';command(['openssl','genpkey','-algorithm','ED25519','-out',key]);key.chmod(0o600)
    public=command(['openssl','pkey','-in',key,'-pubout'])+'\n'
    (config/'updater/trust.json').write_text(json.dumps({'lab-test':public}))
    policy=policy_prepare(old,new,[identity],1)
    policy_envelope=sign(policy,key,'lab-test')
    release={'version':'1.8.0','sha':TARGET_SHA,'digest':TARGET_DIGEST,'size':new.stat().st_size,
        'url':'https://github.com/Assyauq26/buattokoonline/releases/download/v1.8.0/store-v1.8.0.tar.gz',
        'channel':'stable','minimumUpdater':3,'minimumInstalledVersion':'1.7.4','maximumInstalledVersion':'1.7.4',
        'dbContract':1,'rollbackCompatible':False,'notes':'Verified isolated lab upgrade','upgradePolicy':policy_envelope}
    now=int(time.time());cat={'format':2,'repository':core.REPO,'sequence':1,'issuedAt':now,'expiresAt':now+86400,'releases':[release],'revoked':[]}
    payload=root/'catalog-payload';payload.write_text(json.dumps(cat));sig=root/'catalog-sig'
    command(['openssl','pkeyutl','-sign','-inkey',key,'-rawin','-in',payload,'-out',sig])
    import base64
    (root/'catalog.json').write_text(json.dumps({'keyId':'lab-test','payload':base64.b64encode(payload.read_bytes()).decode(),'signature':base64.b64encode(sig.read_bytes()).decode()}))
    cfg={'installation':identity,'origin':runtime['APP_ORIGIN'],'channel':'stable','statusAddress':gateway,'statusPort':17842,'proxyPort':3198,'catalog':'https://buattokosendiri.web.id/api/platform/store-releases',
        'trust':str(config/'updater/trust.json'),'controlToken':str(token),'baseline':str(config/'updater/baseline.json'),
        'database':str(data/'state.sqlite'),'jobs':str(data/'jobs'),'approvedProxyHashes':{'live':hashlib.sha256(live).hexdigest(),'maintenance':hashlib.sha256(maintenance).hexdigest()}}
    if official:
        cfg['officialCatalog']=True
        (config/'updater/trust.json').write_bytes((source/'deploy/updater-trust.json').read_bytes())
    (config/'updater/config.json').write_text(json.dumps(cfg));State(cfg['database'],identity)
    unit='single-store-rehearsal-'+case
    service=Path('/etc/systemd/system')/(unit+'.service');timer=service.with_suffix('.timer')
    if service.exists() or timer.exists():raise RuntimeError('Lab systemd unit already exists')
    service.write_text('[Unit]\nDescription=Disposable updater cron drain proof\n[Service]\nType=oneshot\nExecStart=/bin/sleep 4\n')
    timer.write_text('[Unit]\nDescription=Disposable updater timer\n[Timer]\nOnBootSec=999999\nUnit='+unit+'.service\n[Install]\nWantedBy=timers.target\n')
    command(['systemctl','daemon-reload']);command(['systemctl','start',unit+'.timer'])
    command(dc+['up','-d','--no-build','--wait','app','proxy'])
    print(json.dumps({'prepared':case,'baselineVersion':'1.7.4','sourceSha':BASE_RELEASE_SOURCE,'isolatedNetworks':True,'originalStoreMutated':False}))


@contextlib.contextmanager
def context(case):
    root=BASE/case;config=root/'etc';cfg=json.loads((config/'updater/config.json').read_text())
    real_run=core.run
    timer='single-store-rehearsal-'+case
    def address(service,port):
        cid=real_run(['docker','compose','-f',str(root/'compose.json'),'ps','-q',service])
        info=json.loads(real_run(['docker','inspect',cid]))[0]
        network=info['NetworkSettings']['Networks']['updater-lab-'+case+'_web']
        return 'http://'+network['IPAddress']+':'+str(port)
    def run(args,input=None,timeout=120,capture=True):
        args=[str(v) for v in args]
        if args[0]=='systemctl':args=[v.replace('single-store-maintenance',timer) for v in args]
        # Docker internal networks intentionally do not publish host ports. The
        # test operator reaches the private bridge; containers have no egress.
        args=[v.replace('http://127.0.0.1:3000',address('app',3000)) if v.startswith('http://127.0.0.1:3000') else
              v.replace('http://127.0.0.1:3088',address('proxy',cfg.get('proxyPort',80))) if v.startswith('http://127.0.0.1:3088') else v for v in args]
        if any(v.startswith('http://') and ':3198' in v for v in args):args+=['-H','Host: 127.0.0.1:3198']
        return real_run(args,input,timeout,capture)
    def public(state):
        for p in ('/','/login','/api/v1/ready'):run(['curl','--fail','--silent','--max-time','15','http://127.0.0.1:3088'+p])
    class Transport:
        def open(self,*a,**k):return io.BytesIO((root/'catalog.json').read_bytes())
    def catalog(config,state):
        cat=verify((root/'catalog.json').read_bytes(),core.read_json(config['trust']));state.catalog(cat)
        return cat
    def fresh(config,state,release,installed):
        cat=catalog(config,state)
        return authorized(release,installed,config,state,cat)
    def backup(engine,folder):
        value=updater.backup();updater.verify_backup(value);return value
    old_active=NativeForward.active
    old_drain=NativeForward.drain
    old_save=NativeForward.save
    def active(driver,unit):return old_active(driver,unit.replace('single-store-maintenance',timer))
    def drain(driver,j):
        command(['systemctl','start','--no-block',timer+'.service'])
        began=time.monotonic();old_drain(driver,j)
        (root/'drain-proof.json').write_text(json.dumps({'elapsed':time.monotonic()-began,'unit':timer,'realSystemd':True}))
    def save(driver,j):
        old_save(driver,j)
        fault=root/'fault.json';trigger=root/'fault-triggered.json'
        if fault.exists() and not trigger.exists():
            request=json.loads(fault.read_text())
            if j['phase']==request['phase']:
                core.atomic_json(trigger,{'phase':j['phase'],'pid':os.getpid(),'migrationStarted':j.get('migration_started'),'trafficMayHaveOpened':j.get('traffic_may_have_opened')})
                if request['action']=='kill':os.kill(os.getpid(),signal.SIGKILL)
                if request['action']=='pause':
                    while True:time.sleep(1)
    from update_service.engine import Engine
    with contextlib.ExitStack() as stack:
        for name,value in [('core.ROOT',root),('core.CONFIG',config),('core.DATA',root/'data'),('core.COMPOSE',root/'compose.json'),
            ('core.STATE',config/'setup.json'),('updater.BACKUPS',root/'backups'),('core.run',run),('core.public_health',public),
('update_service.native_forward.NativeForward.active',active),
            ('update_service.native_forward.NativeForward.drain',drain),
            ('update_service.native_forward.NativeForward.save',save),
            ('update_service.engine.Engine.backup',backup)]:stack.enter_context(patch(name,value))
        if not cfg.get('officialCatalog'):
            for name,value in [('update_service.server.build_opener',lambda *a:Transport()),('update_service.policy_feed.fresh',fresh),('update_service.policy_feed.current_catalog',catalog),('update_service.native_forward.fresh',fresh)]:stack.enter_context(patch(name,value))
        yield root,cfg


def run(case,recover=False):
    with context(case) as (root,cfg):
        controller=Controller(cfg)
        if recover:
            job=controller.state.jobs()[0]
            from update_service.reconcile import reconcile
            reconcile(cfg,job['id'])
            result=controller.state.jobs()[0]
            print(json.dumps({'reconciled':result['state']}));return
        admin=json.loads(core.sql('''SELECT row_to_json(u) FROM (SELECT u.id,u."sessionVersion" FROM "User" u JOIN "UserRole" ur ON ur."userId"=u.id JOIN "Role" r ON r.id=ur."roleId" WHERE u."isActive" AND r.name='Admin' LIMIT 1) u;'''))
        body={'installation':cfg['installation'],'actor':admin['id'],'sessionVersion':admin['sessionVersion'],'sessionHash':'f'*64,'sessionExpires':int(time.time())+86400}
        result=controller.command({**body,'action':'check'})
        (root/'discovery.json').write_text(json.dumps(result))
        if not result['release']:raise RuntimeError('Discovery blocked: '+str(result['availability']['reason']))
        import uuid
        result=controller.command({**body,'action':'start','sha':TARGET_SHA,'requestKey':str(uuid.uuid4())})
        job=controller.state.jobs()[0]
        controller.engine.process(job)
        final=controller.state.jobs()[0]
        report={'case':case,'state':final['state'],'detail':json.loads(final['detail']),
            'version':core.read_json(core.CONFIG/'version.json')['version'],'ledger':len(controller.engine.ledger()),
            'artifactDigest':TARGET_DIGEST,'nativeDocker':True,'catalogTransport':'signed test file',
            'backupPath':core.read_json(Path(cfg['jobs'])/job['id']/'forward.json').get('backup')}
        (root/'result.json').write_text(json.dumps(report));print(json.dumps(report))
        if final['state']!='succeeded':raise RuntimeError('Native upgrade did not succeed')


def serve(case):
    with context(case) as (root,cfg),open(root/'worker.lock','a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        controller=Controller(cfg)
        path=root/'run/control.sock';path.unlink(missing_ok=True)
        server=UnixServer(str(path),Handler);server.controller=controller;server.readonly=False
        path.chmod(0o660);os.chown(path,0,1000)
        status=StatusServer((cfg['statusAddress'],17842),Handler);status.controller=controller;status.readonly=True
        for action in (server.serve_forever,status.serve_forever,controller.worker):threading.Thread(target=action,daemon=True).start()
        core.atomic_json(root/'worker-ready.json',{'pid':os.getpid(),'version':3,'case':case})
        while True:signal.pause()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','run','recover','serve']);parser.add_argument('--case',required=True)
    parser.add_argument('--empty',action='store_true');parser.add_argument('--official-catalog',action='store_true')
    args=parser.parse_args()
    if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{8}',args.case):raise SystemExit('Explicit root disposable case required')
    if args.command=='prepare':prepare(args.case,args.empty,args.official_catalog)
    elif args.command=='serve':serve(args.case)
    else:run(args.case,args.command=='recover')
