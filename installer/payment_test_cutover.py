"""Exact, app-only continuation of the deployed PR56 pilot. No schema mutation.

Uses the official durable cutover engine, write fence, verified backup and recovery.
All previous receipts/SQL/ledger/private configuration remain intact.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
import core
import promotions_cutover as official
import promotions_transition as package
import payment_evidence_cutover as pilot

BASE_SHA = 'aeb4846308544c544e1019998f5edf3d2e6fb3b1'
BASE_DIGEST = '68ed5e7c07261ec0fcd0f098ce604780fb81600f482e797b252d72868dbcd781'
BASE_IMAGE = 'sha256:82ca8b82318ca6d223b6e53a22d7ebb06c5c3a5fff9fb4ecddbaa8407d2fd4c7'
GUARD = pilot.NEW_GUARD
NEXT_GUARD = GUARD.replace(b"'hubify-payment-evidence-cutover.json')", b"'hubify-payment-evidence-cutover.json','hubify-payment-test-cutover.json')")
check = official.check
digest = package.digest

def same_schema(old, new, old_files, new_files):
    check(len(old['migrations']) == 32 and new['migrations'] == old['migrations'], 'test cutover requires identical 32 migrations')
    paths = ['app/prisma/schema.prisma', 'app/prisma/migrations/migration_lock.toml']
    paths += ['app/prisma/migrations/'+n+'/migration.sql' for n in old['migrations']]
    check(all(old_files[p] == new_files[p] for p in paths), 'schema or historical SQL changed')

PREPARED_SHA = '5c3ff6dc8d58da68b18d707f83175daeeeecc2d0'
PREPARED_DIGEST = '14e24eeddafb14856ac066651174ed80f27fa197e35bdbd082238303670b7e9c'
PREPARED_IMAGE = 'sha256:4f4618b3fdbc141649f6d80c16d2250f3329e1fc6a973811dc5c6d041c1d3404'
PREPARED_TREE = 'b970cb299ffd660a7a9ebc3a5ad77ce7cb85510c'

def review_prepared(receipt, prepared, candidate):
    check(receipt.get('phase')=='rolled_back' and receipt.get('sha')==PREPARED_SHA and receipt.get('digest')==PREPARED_DIGEST
        and receipt.get('image')==PREPARED_IMAGE and receipt.get('candidate') and not receipt.get('fence_started')
        and not receipt.get('migration_started') and not receipt.get('traffic_may_have_opened'), 'prepared build receipt not eligible')
    check(receipt.get('manifest')==prepared and prepared.get('source_sha')==PREPARED_SHA, 'prepared artifact receipt mismatch')
    before={p:h for p,h in prepared['files'].items() if p.startswith('app/')}
    after={p:h for p,h in candidate['files'].items() if p.startswith('app/')}
    check(before and before==after, 'prepared application tree changed')
    check(prepared['version']==candidate['version']=='1.8.1' and prepared['migrations']==candidate['migrations'], 'prepared release contract changed')
    return PREPARED_IMAGE

class Native(official.Native):
    proxy_hashes = pilot.Native.proxy_hashes
    base_sha, base_digest, base_image, base_tree = BASE_SHA, BASE_DIGEST, BASE_IMAGE, pilot.APP_TREE
    previous_receipt = 'hubify-payment-evidence-cutover.json'
    journal_name = 'hubify-payment-test-cutover.json'
    previous_guard, next_guard = GUARD, NEXT_GUARD
    deployment_name = 'hubify-blu-transfer-test'

    def prepared_image(self): return None

    def __init__(self, repository, archive, archive_digest, sha, baseline):
        super().__init__(repository, archive, archive_digest, sha, baseline)
        self.folder = core.ROOT/'releases'/('hubify-blu-test-'+sha[:12]+'-'+archive_digest[:12])
        self.journal_path = core.CONFIG/self.journal_name
        self.old_manifest, self.old_files = package.package(baseline, self.base_digest, self.base_sha, '1.8.1')
        self.manifest, self.files = package.package(archive, archive_digest, sha, '1.8.1')
        tree = core.run(['git','-C',str(self.repository),'rev-parse',sha+':app'])
        official.verify_git_package(self.repository, sha, self.manifest, self.files, expected_tree=tree)
        same_schema(self.old_manifest, self.manifest, self.old_files, self.files)

    def file_guards(self):
        result = super().file_guards()
        paths = [core.CONFIG/'payment-evidence'/n for n in ['google-client.json','encryption.key','pilot-runtime.env','pilot-migration.env']]
        paths += [core.ROOT/n/'update_service/engine.py' for n in ['manager','updater']]
        for path in paths:
            check(path.is_file() and not path.is_symlink(), 'guarded file missing/symlink')
            result[str(path)] = digest(path.read_bytes())
        return result

    def preflight(self, own_journal=False):
        check(os.geteuid()==0, 'root operator required')
        self.worker_idle(); check(self.carrier_idle(), 'carrier operation pending')
        for name, key in [('hubify-promotions-cutover.json','phase'),('hubify-payment-evidence-cutover.json','phase'),('update.json','status')]:
            path=core.CONFIG/name
            if path.exists(): check(core.read_json(path).get(key) in ('complete','rolled_back'), 'prior operation unresolved')
        prior=self.load()
        check(not prior or (own_journal and prior['phase']=='build_done' and prior['sha']==self.sha and prior['digest']==self.digest), 'existing test cutover requires reconcile')
        receipt=core.read_json(core.CONFIG/self.previous_receipt)
        check(receipt['phase']=='complete' and receipt['sha']==self.base_sha and receipt['digest']==self.base_digest and receipt['image']==self.base_image, 'previous pilot receipt')
        bundle=self.observe(); obs=bundle['observation']; installed=obs['version']
        check(bundle['context']=={'installation':pilot.history.INSTALLATION,'origin':'https://hubify.web.id'}, 'Hubify installation')
        check(installed['source_sha']==self.base_sha and installed['artifact_sha256']==self.base_digest and installed['image_digest']==self.base_image and installed['version']=='1.8.1', 'test baseline metadata')
        check(obs['source_commit']==self.base_sha and obs['app_tree']==self.base_tree and obs['source_inventory']==self.old_manifest['migrations'], 'source baseline')
        apps=[c for c in obs['containers'] if c['service']=='app']
        check(len(apps)==1 and apps[0]['image']==self.base_image and apps[0]['running'] and apps[0]['health']=='healthy', 'active baseline image')
        paths=package.runtime_paths(self.old_files)
        check(set(bundle['runtime'])==paths and all(bundle['runtime'][p].get('sha256')==digest(self.old_files[p]) for p in paths), 'baseline runtime bytes')
        check(self.ledger_valid({'from':installed}), '32 complete ledger entries required')
        from update_service.native_forward import schema_hash
        check(schema_hash()==pilot.AFTER_SCHEMA, 'schema drift')
        check(self.flags()=={k:'yes' for k in official.FLAGS}, 'Production guard changed')
        self.check_runtime(self.base_sha, self.base_image)
        core.preserved_caddy_content(True,self.proxy_hashes)
        for path, item in receipt['worker_guard_patch'].items():
            check(digest(Path(path).read_bytes())==item['after'] and Path(path).read_bytes().count(self.previous_guard)==1, 'worker guard baseline')
        from update_service.engine import Engine
        Engine(None,{}).resources()
        persistent=int(core.sql("SELECT pg_database_size('store');"))+sum(p.stat().st_size for root in [core.DATA/'media',core.CONFIG] for p in root.rglob('*') if p.is_file())
        prepared=self.prepared_image()
        check(shutil.disk_usage(core.ROOT).free>=official.disk_budget(persistent, images_prepared=own_journal or bool(prepared)), 'insufficient safe disk budget')
        self.bundle=bundle
        return {'transition_accepted':True,'production_mutations':False,'source_sha':self.sha,'digest':self.digest,'guards':self.file_guards(),'migration_count':32,'schema_unchanged':True}

    def check_runtime(self, sha, image):
        item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
        env=dict(s.split('=',1) for s in item['Config']['Env'] if '=' in s)
        check(item['Image']==image and env.get('STORE_BUILD_SHA')==sha and env.get('STORE_INSTALLED_VERSION')=='1.8.1', 'active source/image/version')
        check(env.get('STORE_INSTALLATION_ID')==pilot.history.INSTALLATION and env.get('PAYMENT_PROVIDER','manual')=='manual', 'installation/manual provider')
        check(all(env.get(k)=='yes' for k in official.FLAGS), 'J&T approvals changed')
        check(env.get('PAYMENT_EVIDENCE_PREVIEW')=='true' and env.get('PAYMENT_GMAIL_OAUTH_TEST')=='true' and env.get('PAYMENT_EVIDENCE_ADMIN_IDS'), 'pilot enrollment missing')

    def prepare(self,journal):
        self.folder.mkdir(parents=True,mode=0o700,exist_ok=False)
        source=self.folder/'source';source.mkdir(mode=0o755)
        for name,data in self.files.items():
            path=source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);path.chmod(0o644)
        core.atomic_json(source/'release.json',self.manifest)
        core.atomic_json(source/'.hubify-provenance.json',{'source_sha':self.sha,'app_tree':core.run(['git','-C',str(self.repository),'rev-parse',self.sha+':app']),'archive_sha256':self.digest})
        candidate=copy.deepcopy(journal['old_compose'])
        image=self.prepared_image()
        if image:
            journal['reused_build']={'source_sha':PREPARED_SHA,'artifact_sha256':PREPARED_DIGEST,'app_tree':PREPARED_TREE,'image':image}
        else:
            image='single-store-app:hubify-blu-test-'+self.sha[:12]
            from update_service.engine import Engine
            Engine(None,{}).build(source,image,'runtime')
        candidate['services']['app'].update(image=image,build={'context':str(source/'app'),'target':'runtime'})
        candidate['services']['app'].setdefault('environment',{}).update(STORE_BUILD_SHA=self.sha,STORE_UPDATE_CHANNEL='hubify-development')
        journal['candidate']=candidate
        journal['image']=core.run(['docker','image','inspect','--format','{{.Id}}',image])
        core.atomic_json(self.folder/'compose.json',candidate)

    def drain(self,journal):
        check(self.file_guards()==journal['guards'], 'configuration changed during build')
        core.run(['systemctl','stop','single-store-updater.service']);self.worker_idle()
        journal['worker_guard_patch']={}
        for i,path in enumerate([core.ROOT/n/'update_service/engine.py' for n in ['manager','updater']]):
            raw=path.read_bytes();check(digest(raw)==journal['guards'][str(path)] and raw.count(self.previous_guard)==1,'worker changed')
            pilot.write_private_once(self.folder/('previous-worker-'+str(i)+'.py'),raw)
            fresh=raw.replace(self.previous_guard,self.next_guard);compile(fresh,str(path),'exec')
            journal['worker_guard_patch'][str(path)]={'before':digest(raw),'after':digest(fresh)};self.save(journal)
            temp=path.with_suffix('.blu-guard-tmp');temp.write_bytes(fresh);temp.chmod(0o644);os.replace(temp,path)
        core.run(['systemctl','stop','single-store-maintenance.timer'])
        deadline=time.monotonic()+180
        while self.active('single-store-maintenance.service'):
            check(time.monotonic()<deadline,'maintenance still active');time.sleep(1)

    def expected_ledger(self,journal): return journal['from']['migrations']

    def ledger_valid(self,journal):
        rows=self.ledger_rows()
        return len(rows)==32 and all(r['finished_at'] and not r['rolled_back_at'] for r in rows) and {r['migration_name']:r['checksum'] for r in rows}==journal['from']['migrations']

    def database_state(self,journal):
        if not self.ledger_valid(journal):return 'uncertain'
        # An unchanged schema cannot prove that build/fence/backup completed.
        # Reconcile before the verified no-op stage must roll back, not activate.
        return 'new' if journal.get('migration_started') else 'old'

    def data_snapshot(self):
        names=json.loads(core.sql("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations';"))
        result={}
        for name in names:
            check(name.replace('_','').isalnum(), 'table identifier')
            row="encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')"
            result[name]=core.sql('SELECT encode(sha256(convert_to(coalesce(string_agg('+row+",'' ORDER BY "+row+"),''),'UTF8')),'hex') FROM \""+name+'" t;')
        return result

    def migrate(self,journal):
        check(journal.get('backup_verified'), 'verified backup required')
        self.verify_migration(journal)  # Deliberately no SQL/grants/migrate command.

    def verify_migration(self,journal):
        from update_service.native_forward import schema_hash
        check(self.database_state(journal)=='new' and self.ledger_rows()==journal['before_ledger'], 'ledger changed')
        check(schema_hash()==pilot.AFTER_SCHEMA and self.data_snapshot()==journal['before_data'], 'schema/data changed while fenced')

    def verify_active(self,journal):
        check(self.database_state(journal)=='new','active ledger')
        core.healthy();self.check_runtime(self.sha,journal['image'])
        for path,item in journal.get('worker_guard_patch',{}).items(): check(digest(Path(path).read_bytes())==item['after'],'recovery guard changed')
        # Config/credentials must remain byte-identical; Compose/version are the
        # two intentional changes, worker files have their separate exact receipt.
        for path,expected in journal['guards'].items():
            if path in [str(core.COMPOSE),str(core.CONFIG/'version.json')] or path in journal.get('worker_guard_patch',{}): continue
            if path==str(core.CONFIG/'Caddyfile') and not journal.get('traffic_may_have_opened'):continue
            check(digest(Path(path).read_bytes())==expected,'preserved configuration changed')

    def activate(self,journal):
        check(journal.get('backup_verified') and journal.get('backup'), 'verified backup required before activation')
        check(self.flags()==journal['flags'], 'Production approvals changed')
        core.atomic_json(core.COMPOSE,journal['candidate'])
        core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app'],timeout=180)

    def metadata(self,journal):
        if not journal.get('traffic_may_have_opened'): self.verify_migration(journal)
        cfg=core.read_json(core.CONFIG/'updater/config.json')
        core.atomic_json(cfg['baseline'],{'root':str(self.folder/'source'),'files':journal['manifest']['files']})
        core.atomic_json(core.CONFIG/'version.json',{**journal['from'],'source_sha':self.sha,'artifact_sha256':self.digest,'image_digest':journal['image'],
            'deployment':self.deployment_name,'previous_source_sha':self.base_sha,'channel':'hubify-development'})

    def rollback_before_migration(self,journal):
        # Same schema; even the nominal "migration" phase performed no mutation.
        check(self.ledger_valid(journal),'unsafe rollback: ledger drift')
        if journal.get('fence_started'):
            core.atomic_json(core.COMPOSE,journal['old_compose'])
            core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app']);core.healthy()
            core.write_caddy(core.read_json(core.STATE),live=True,preserve_extra_sites=True,approved_proxy_hashes=self.proxy_hashes)
            core.public_health(core.read_json(core.STATE))
        self.resume_workers(journal)


class AuthNative(Native):
    """Separately pinned continuation; never re-label the completed prior receipt."""
    base_sha = 'e6cc5eb72cf9d737bfce59ed7a514bdea48ad0ac'
    base_digest = 'c9a2b69ca79923081729eb0f8cd790eb9c9a03002c11dc88ab0d813f3e1079a6'
    base_image = 'sha256:129a6f7875de9da655a025013c7a22c86b37d4963dbb419e5bacf12c45a12c5f'
    base_tree = '4cc61bfd835cb7131ac3199c87d9a92cee34fb52'
    previous_receipt = 'hubify-payment-test-cutover.json'
    journal_name = 'hubify-blu-auth-cutover.json'
    previous_guard = NEXT_GUARD
    deployment_name = 'hubify-blu-signature-review'
    next_guard = NEXT_GUARD.replace(b"'hubify-payment-test-cutover.json')", b"'hubify-payment-test-cutover.json','hubify-blu-auth-cutover.json')")


class PreparedAuthNative(AuthNative):
    """Reuse one authenticated successful build after its pre-outage disk refusal.

    The full unchanged app tree and immutable image are verified before using the
    existing images-prepared disk budget. No retry receipt is rewritten.
    """
    journal_name = 'hubify-blu-auth-retry-cutover.json'
    next_guard = AuthNative.next_guard.replace(b"'hubify-blu-auth-cutover.json')", b"'hubify-blu-auth-cutover.json','hubify-blu-auth-retry-cutover.json')")

    def file_guards(self):
        guards=super().file_guards()
        path=core.CONFIG/'hubify-blu-auth-cutover.json'
        guards[str(path)]=digest(path.read_bytes())
        return guards

    def prepared_image(self):
        path=core.CONFIG/'hubify-blu-auth-cutover.json'
        check(path.is_file() and not path.is_symlink(),'prepared receipt missing')
        receipt=core.read_json(path)
        archive=core.ROOT/'operator-packages/hubify-blu-auth-5c3ff6dc8d58.tar.gz'
        manifest,files=package.package(archive,PREPARED_DIGEST,PREPARED_SHA,'1.8.1')
        compiled_repository=core.ROOT/'operator-sources'/('pr56-'+PREPARED_SHA)
        official.verify_git_package(compiled_repository,PREPARED_SHA,manifest,files,expected_tree=PREPARED_TREE)
        check(core.run(['git','-C',str(self.repository),'rev-parse',self.sha+':app'])==PREPARED_TREE,'prepared target app tree changed')
        image=review_prepared(receipt,manifest,self.manifest)
        check(core.run(['docker','image','inspect','--format','{{.Id}}',image])==image,'prepared image identity changed')
        # No bind mounts, network, secrets or app execution: only source hashes
        # from the immutable factory image, under an unprivileged read-only root.
        paths=package.runtime_paths(files)
        js="const fs=require('fs'),c=require('crypto');let s='';process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>{let o={};for(const p of JSON.parse(s)){try{o[p]=c.createHash('sha256').update(fs.readFileSync('/app/'+p.slice(4))).digest('hex')}catch{o[p]=null}}console.log(JSON.stringify(o))})"
        observed=json.loads(core.run(['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','--entrypoint','node',image,'-e',js],input=json.dumps(sorted(paths)).encode()))
        check(set(observed)==paths and all(observed[p]==digest(files[p]) for p in paths),'prepared image source bytes changed')
        return image
