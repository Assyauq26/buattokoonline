"""Single Hubify schema32 pilot -> public schema33 candidate, official cutover.

The two independently proven legacy ledger checksums are preserved. This is
not the public canonical31 adapter and cannot authorize another installation.
"""
import json
import base64
from pathlib import Path
import core
import promotions_cutover as official
import promotions_transition as package
import payment_test_cutover as prior
from update_service.native_forward import NativeForward,schema_hash
from update_service.blu_forward import ACTIVATION_NAME,ACTIVATION_SQL,AFTER_SCHEMA

check=official.check

def review_schema(old,new,old_files,new_files):
    check(len(old['migrations'])==32 and new['migrations']=={**old['migrations'],ACTIVATION_NAME:ACTIVATION_SQL},'exact schema32 to33 required')
    for name in old['migrations']:
        path='app/prisma/migrations/'+name+'/migration.sql'
        check(old_files[path]==new_files[path],'historical SQL changed')
    check(old_files['app/prisma/migrations/migration_lock.toml']==new_files['app/prisma/migrations/migration_lock.toml'],'migration provider changed')
    check(new['compatibility']==dict(db_contract=1,minimum_installed_contract=1,maximum_installed_contract=1,
        postgres_major=16,rollback_compatible=False,minimum_installed_version='1.8.1',maximum_installed_version='1.8.1'),'manifest compatibility')

class Native(prior.Native):
    base_sha='8e65f4a74eb7b597afa27e87f28e3a5d141da1c2'
    base_digest='376d677b7a47cdf31bae30a322d6d5a503a7422950c3910128edd86ec32ec0e9'
    base_image=prior.PREPARED_IMAGE
    base_tree=prior.PREPARED_TREE
    previous_receipt='hubify-blu-auth-retry-cutover.json'
    journal_name='hubify-blu-checkout-cutover.json'
    previous_guard=prior.PreparedAuthNative.next_guard
    next_guard=previous_guard.replace(b"'hubify-blu-auth-retry-cutover.json')",b"'hubify-blu-auth-retry-cutover.json','hubify-blu-checkout-cutover.json')")
    new_tables=()
    snapshot_omit={'PaymentEvidenceSource':"-'automationActorId'"}
    deployment_name='hubify-blu-checkout-v182'
    prepared_images=None

    def prepared_image(self):
        if not self.prepared_images:return None
        proof=self.prepared_images
        check(proof.get('sourceSha')==self.sha and proof.get('artifactDigest')==self.digest
            and proof.get('appTree')==core.run(['git','-C',str(self.repository),'rev-parse',self.sha+':app']),
            'prepared artifact identity')
        paths=package.runtime_paths(self.files)
        js="const f=require('fs'),c=require('crypto');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let o={};for(const p of JSON.parse(s)){try{o[p]=c.createHash('sha256').update(f.readFileSync('/app/'+p.slice(4))).digest('hex')}catch{o[p]=null}}console.log(JSON.stringify(o))})"
        for name in ('app','tools'):
            image=proof.get(name,'')
            check(isinstance(image,str) and image.startswith('sha256:') and len(image)==71,'prepared image identity')
            check(core.run(['docker','image','inspect','--format','{{.Id}}',image])==image,'prepared image missing')
            observed=json.loads(core.run(['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL',
                '--security-opt','no-new-privileges','--user','node','--entrypoint','node',image,'-e',js],
                input=json.dumps(sorted(paths)).encode()))
            check(set(observed)==paths and all(observed[p]==package.digest(self.files[p]) for p in paths),'prepared source bytes')
        return proof['app']

    def __init__(self,repository,archive,archive_digest,sha,baseline):
        official.Native.__init__(self,repository,archive,archive_digest,sha,baseline)
        self.folder=core.ROOT/'releases'/('hubify-blu-checkout-'+sha[:12]+'-'+archive_digest[:12])
        self.journal_path=core.CONFIG/self.journal_name
        self.old_manifest,self.old_files=package.package(baseline,self.base_digest,self.base_sha,'1.8.1')
        self.manifest,self.files=package.package(archive,archive_digest,sha,'1.8.2')
        official.verify_git_package(self.repository,sha,self.manifest,self.files,
            expected_tree=core.run(['git','-C',str(self.repository),'rev-parse',sha+':app']))
        review_schema(self.old_manifest,self.manifest,self.old_files,self.files)

    def preflight(self,own_journal=False):
        if own_journal:
            j=self.load()
            check(j and j['phase']=='build_done' and j['sha']==self.sha and j['digest']==self.digest,'prepared build identity')
            for name in ('app','tools'):
                image=core.run(['docker','image','inspect','--format','{{.Id}}',j['candidate']['services'][name]['image']])
                check(image.startswith('sha256:') and (name!='app' or image==j['image']),'prepared image changed')
        report=super().preflight(own_journal)
        expected=dict(self.old_manifest['migrations'])
        for name,(legacy,canonical) in prior.pilot.history.PAIRS.items():
            path='app/prisma/migrations/'+name+'/migration.sql'
            record=self.bundle['observation']['historical_files'][name]
            original=base64.b64decode(record['original']['base64'],validate=True)
            active=base64.b64decode(record['active']['base64'],validate=True)
            check(package.digest(original)==legacy and package.digest(self.old_files[path])==canonical
                and active==self.old_files[path] and original.replace(b'\r\n',b'\n')==active,'historical byte proof')
            expected[name]=legacy
        check(self.bundle['observation']['version']['migrations']==expected,'exact legacy ledger baseline')
        check(core.sql('SELECT count(*) FROM "PaymentEvidenceSource" WHERE enabled;')=='0','unexpected active pilot')
        return {**report,'schema_unchanged':False,'before_migrations':32,'after_migrations':33}

    def prepare(self,j):
        super().prepare(j)
        from update_service.engine import Engine
        source=self.folder/'source'
        image=self.prepared_images['tools'] if self.prepared_images else 'single-store-tools:hubify-blu-checkout-'+self.sha[:12]
        if not self.prepared_images:Engine(None,{}).build(source,image,'tools')
        else:j['reused_build']={**self.prepared_images,'operatorReviewed':True}
        j['candidate']['services']['tools'].update(image=image,build={'context':str(source/'app'),'target':'tools'})
        j['candidate']['services']['app']['environment'].update(STORE_INSTALLED_VERSION='1.8.2',PAYMENT_BLU_CHECKOUT_ENABLED='true')
        core.atomic_json(self.folder/'compose.json',j['candidate'])

    def data_snapshot(self):return NativeForward.data_snapshot(self)

    def database_state(self,j):
        rows=self.ledger_rows()
        if len(rows)!=len({r['migration_name'] for r in rows}) or any(not r['finished_at'] or r['rolled_back_at'] for r in rows):return 'uncertain'
        ledger={r['migration_name']:r['checksum'] for r in rows}
        return 'old' if ledger==j['from']['migrations'] else 'new' if ledger==self.expected_ledger(j) else 'uncertain'

    def expected_ledger(self,j):return {**j['from']['migrations'],ACTIVATION_NAME:ACTIVATION_SQL}

    def migrate(self,j):
        check(j.get('backup_verified') and j.get('backup') and self.database_state(j)=='old','verified backup and old schema required')
        core.dc(['run','--rm','-T','--no-deps','--name','single-store-blu-checkout-migrate-'+self.sha[:12],
            'tools','npm','run','db:migrate'],file=self.folder/'compose.json',timeout=300)
        core.grant_runtime()

    def verify_migration(self,j):
        check(self.database_state(j)=='new' and schema_hash()==AFTER_SCHEMA,'schema33 verification')
        if not j.get('traffic_may_have_opened'):
            check([r for r in self.ledger_rows() if r['migration_name']!=ACTIVATION_NAME]==j['before_ledger'],'historical ledger changed')
            check(self.data_snapshot()==j['before_data'],'existing data changed')
            check(core.sql('SELECT count(*) FROM "PaymentEvidenceSource" WHERE enabled OR "automationActorId" IS NOT NULL;')=='0','unexpected account activation')

    def check_runtime(self,sha,image):
        if sha==self.base_sha:return super().check_runtime(sha,image)
        item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
        env=dict(x.split('=',1) for x in item['Config']['Env'] if '=' in x)
        check(item['Image']==image and env.get('STORE_BUILD_SHA')==sha and env.get('STORE_INSTALLED_VERSION')=='1.8.2','active release identity')
        check(env.get('STORE_INSTALLATION_ID')==prior.pilot.history.INSTALLATION and env.get('PAYMENT_PROVIDER','manual')=='manual'
            and env.get('PAYMENT_BLU_CHECKOUT_ENABLED')=='true','blu runtime contract')
        check(all(env.get(k)=='yes' for k in official.FLAGS),'J&T guard changed')

    def metadata(self,j):
        if not j.get('traffic_may_have_opened'):self.verify_migration(j)
        cfg=core.read_json(core.CONFIG/'updater/config.json')
        core.atomic_json(cfg['baseline'],{'root':str(self.folder/'source'),'files':j['manifest']['files']})
        core.atomic_json(core.CONFIG/'version.json',{**j['from'],'version':'1.8.2','source_sha':self.sha,
            'migrations':self.expected_ledger(j),'artifact_sha256':self.digest,'image_digest':j['image'],
            'deployment':self.deployment_name,'previous_source_sha':self.base_sha,'channel':cfg['channel']})

    def rollback_before_migration(self,j):
        check(not j.get('migration_started') and self.database_state(j)=='old','unsafe app rollback')
        return super().rollback_before_migration(j)

    def external_stopped(self,j):
        super().external_stopped(j)
        check('single-store-blu-checkout-migrate-'+self.sha[:12] not in core.run(['docker','ps','--format','{{.Names}}']).splitlines(),'migration still running')
