"""Exact Hubify v1.8.0 -> PR56 observational pilot. No public/fleet authorization.

Reuses the official durable Cutover state machine and backup/fence/restore checks.
Existing staging/generic updater guards are unchanged. Never resolves migrations,
rewrites historical SQL/ledger or disables carrier approvals.
"""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import core
import updater
import historical_migrations as history
import promotions_transition as package
import promotions_cutover as official

BASE_SHA = '7e81f8e60b27ab5695ac50ac6b653b63095e36d1'
BASE_DIGEST = '2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223'
BASE_IMAGE = 'sha256:46543294c7c4c6289f4434bcb904ce7031156149697ec0b3a5a0a4cee0624025'
BASE_TREE = '7b8ddfe64c35c981da0aed5804135ea719e2f714'
APP_TREE = '320423e1033751b8a031e664ba661fd11d90b610'
BEFORE_SCHEMA = 'd471166ce2ce7b4c9f579b1d1444c6db1f9507cb145a74b556b209a8e944d356'
AFTER_SCHEMA = '72f1aa730f8c992605fba501f50ffb27e779dd7a786532904f0d6830aa46b02a'
ADDITIONS = {
 '20261113120000_order_customer_list_index': 'ee0d01eb42e4c4a71c5d64b26e2af46ecbe79915f68f2543ff7c8e99fb538e80',
 '20261114090000_payment_evidence_review': 'e674bd330da1bd6ff0f682caf1326541a058bcb73b2ee58e99635687d4a27286',
}
TABLES = ('PaymentEvidenceSource','PaymentEvidenceAttempt','IncomingPaymentEvidence',
          'PaymentEvidenceClaim','PaymentEvidenceReview','PaymentEvidenceOAuthState')
WORKER_HASHES = {
 'manager': '7e692a17a361d4acc8377fb3d751a032385a977a259ff016567b8e72aa6f8236',
 'updater': '99bd3eaa1601e2dc5681e59b1ca94526bf12c6d75d8eed6269ff3ebbea60a375',
}
OLD_GUARD = b" path=core.CONFIG/'hubify-promotions-cutover.json'\n if path.exists() and core.read_json(path).get('phase') not in ('complete','rolled_back'):\n  raise Rejected('operator_cutover_in_progress')"
NEW_GUARD = b" for name in ('hubify-promotions-cutover.json','hubify-payment-evidence-cutover.json'):\n  path=core.CONFIG/name\n  if path.exists() and core.read_json(path).get('phase') not in ('complete','rolled_back'):\n   raise Rejected('operator_cutover_in_progress')"
check = official.check
digest = package.digest

def review(bundle, baseline, candidate):
 old, old_files = baseline
 new, new_files = candidate
 obs=bundle['observation']; installed=obs['version']
 check(bundle['context']=={'installation':history.INSTALLATION,'origin':'https://hubify.web.id'},'pilot installation')
 check(installed.get('version')=='1.8.0' and installed.get('source_sha')==BASE_SHA and installed.get('artifact_sha256')==BASE_DIGEST and installed.get('image_digest')==BASE_IMAGE and installed.get('db_contract')==1,'pilot metadata baseline')
 check(obs['source_commit']==BASE_SHA and obs['app_tree']==BASE_TREE and obs['source_inventory']==old['migrations'],'pilot source baseline')
 app=[c for c in obs['containers'] if c['service']=='app']
 check(len(app)==1 and app[0]['image']==BASE_IMAGE and app[0]['running'] and app[0]['health']=='healthy','pilot running baseline')
 check(digest(json.dumps(bundle['schema'],sort_keys=True,separators=(',',':')).encode())==BEFORE_SCHEMA,'pilot schema drift')
 expected=dict(old['migrations'])
 check(len(expected)==30,'thirty baseline migrations')
 for name,(legacy,canonical) in history.PAIRS.items():
  rel='app/prisma/migrations/'+name+'/migration.sql'
  record=obs['historical_files'][name]
  original=base64.b64decode(record['original']['base64'],validate=True)
  active=base64.b64decode(record['active']['base64'],validate=True)
  check(digest(original)==legacy and digest(old_files[rel])==canonical and active==old_files[rel] and original.replace(b'\r\n',b'\n')==active,'pilot historical byte pair')
  expected[name]=legacy
 rows=obs['database']['ledger']
 check(len(rows)==30 and all(r['finished'] and not r['rolled_back'] for r in rows) and {r['migration_name']:r['checksum'] for r in rows}==expected==installed['migrations'],'pilot ledger baseline')
 paths=package.runtime_paths(old_files)
 check(set(bundle['runtime'])==paths,'pilot runtime inventory')
 check(all(bundle['runtime'][p].get('sha256')==digest(old_files[p]) for p in paths),'pilot runtime bytes')
 check(new['migrations']=={**old['migrations'],**ADDITIONS},'pilot migration inventory')
 check(all(digest(new_files['app/prisma/migrations/'+n+'/migration.sql'])==h for n,h in ADDITIONS.items()),'pilot reviewed new SQL bytes')
 check(all(new_files['app/prisma/migrations/'+n+'/migration.sql']==old_files['app/prisma/migrations/'+n+'/migration.sql'] for n in old['migrations']),'pilot historical SQL changed')
 check(new.get('compatibility')=={'db_contract':1,'minimum_installed_contract':1,'maximum_installed_contract':1,'postgres_major':16,'rollback_compatible':True,'minimum_installed_version':'1.8.0','maximum_installed_version':'1.8.0'},'pilot compatibility policy')
 check(json.loads(new_files['release-policy.json'])==new['compatibility'],'pilot policy manifest')
 check(all(obs['app_environment'].get(k)=='yes' for k in official.FLAGS),'pilot carrier approvals')
 check(obs['app_environment'].get('STORE_BUILD_SHA')==BASE_SHA and obs['app_environment'].get('STORE_INSTALLED_VERSION')=='1.8.0','pilot runtime version baseline')
 return {'transition':'hubify-v180-pr56-observation-only','runtime_files_verified':len(paths),'historical_ledger_preserved':True,'new_migrations':ADDITIONS,'production_writes':False}

def private_file(path):
 check(path.is_file() and not path.is_symlink() and path.stat().st_uid==0 and stat.S_IMODE(path.stat().st_mode)==0o600,'private configuration permissions')
 return path.read_bytes()

def write_private_once(path, data):
 if path.exists() or path.is_symlink():
  check(private_file(path)==data,'existing private configuration differs')
  return
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as file: file.write(data);file.flush();os.fsync(file.fileno())

def bounded_url(value):
 parts=urlsplit(value)
 check(parts.scheme in ('postgresql','postgres') and parts.hostname=='db' and parts.path=='/store','migration database endpoint')
 query=dict(parse_qsl(parts.query))
 check('options' not in query,'unexpected migration session options')
 query['options']='-c lock_timeout=10000 -c statement_timeout=90000'
 return urlunsplit((*parts[:3],urlencode(query),parts.fragment))

class Native(official.Native):
 proxy_hashes = {'live':'ac63c99445a588136f2b451080b7d17f2223d9e7086b6f93b061044e84d56cc7','maintenance':'ca35e38c98a199763d778b66922eb703c9f5e3472ad9bdb5a54e1fa5b1384380'}
 def __init__(self, repository, archive, archive_digest, sha, baseline):
  super().__init__(repository,archive,archive_digest,sha,baseline)
  self.folder=core.ROOT/'releases'/('hubify-payment-pilot-'+sha[:12]+'-'+archive_digest[:12])
  self.journal_path=core.CONFIG/'hubify-payment-evidence-cutover.json'
  self.private=core.CONFIG/'payment-evidence'
  self.baseline_package=package.package(baseline,BASE_DIGEST,BASE_SHA,'1.8.0')
  self.manifest,self.files=package.package(archive,archive_digest,sha,'1.8.1')
  official.verify_git_package(self.repository,sha,self.manifest,self.files,expected_tree=APP_TREE)

 def file_guards(self):
  result=super().file_guards()
  result[str(self.private/'google-client.json')]=digest(private_file(self.private/'google-client.json'))
  for path in [core.ROOT/'manager/update_service/engine.py',core.ROOT/'updater/update_service/engine.py']:
   result[str(path)]=digest(path.read_bytes())
  return result

 def google_client(self):
  check(not self.private.is_symlink() and self.private.stat().st_uid==0 and stat.S_IMODE(self.private.stat().st_mode)==0o700,'private configuration directory')
  data=json.loads(private_file(self.private/'google-client.json'))
  check(data.get('project_id')=='buattokosendiri' and data.get('client_id')=='396074019070-o3lp3r9rkmrbnscn7uggcg0ns2u1u9fk.apps.googleusercontent.com' and data.get('redirect_uri')=='https://hubify.web.id/api/v1/admin/payment-evidence/oauth/callback','pilot OAuth client identity')
  check(isinstance(data.get('client_secret'),str) and re.fullmatch('[A-Za-z0-9_-]{8,4096}',data['client_secret']) is not None,'pilot OAuth secret shape')
  return data

 def preflight(self, own_journal=False):
  check(os.geteuid()==0,'root operator required')
  self.worker_idle();check(self.carrier_idle(),'carrier work pending')
  check(not (core.CONFIG/'update.json').exists() or core.read_json(core.CONFIG/'update.json').get('status') not in ('updating','failed','recovery_required'),'prior updater unresolved')
  prior=self.load()
  check(not prior or (own_journal and prior['phase']=='build_done' and prior['sha']==self.sha and prior['digest']==self.digest),'prior pilot intent needs reconciliation')
  previous=core.read_json(core.CONFIG/'hubify-promotions-cutover.json')
  check(previous.get('phase')=='complete' and previous.get('sha')==BASE_SHA and previous.get('digest')==BASE_DIGEST,'previous operator cutover receipt')
  bundle=self.observe()
  result=review(bundle,self.baseline_package,(self.manifest,self.files))
  check(self.flags()=={k:'yes' for k in official.FLAGS},'Production approval mismatch')
  item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
  env=dict(line.split('=',1) for line in item['Config']['Env'] if '=' in line)
  check(env.get('STORE_INSTALLATION_ID')==history.INSTALLATION and env.get('PAYMENT_PROVIDER','manual')=='manual','runtime installation/manual provider')
  check(not any(env.get(k) for k in ['PAYMENT_EVIDENCE_PREVIEW','PAYMENT_GMAIL_OAUTH_TEST','PAYMENT_GOOGLE_CLIENT_SECRET','PAYMENT_INTEGRATION_ENCRYPTION_KEY']),'existing payment runtime requires review')
  self.google_client()
  core.preserved_caddy_content(True,self.proxy_hashes)
  from update_service.engine import Engine
  Engine(None,{}).resources()
  persistent=int(core.sql("SELECT pg_database_size('store');"))+sum(p.stat().st_size for root in [core.DATA/'media',core.CONFIG] for p in root.rglob('*') if p.is_file())
  check(shutil.disk_usage(core.ROOT).free>=official.disk_budget(persistent,images_prepared=own_journal),'pilot disk budget')
  for name,wanted in WORKER_HASHES.items():
   path=core.ROOT/name/'update_service/engine.py'
   check(not path.is_symlink() and digest(path.read_bytes())==wanted and path.read_bytes().count(OLD_GUARD)==1,'installed operator guard requires review')
  from update_service.worker_upgrade import files_digest
  receipt=core.read_json(core.CONFIG/'updater/worker-upgrade.json')
  check(receipt.get('phase')=='complete' and receipt.get('applied') is True and receipt.get('afterFiles')==files_digest(core.ROOT/'updater'),'installed worker receipt/inventory')
  backup=Path(receipt['uiBackup']);before=(backup/'Caddyfile').read_bytes();after=(backup/'Caddyfile.after').read_bytes()
  from update_service.ui_route import routes
  cfg=core.read_json(core.CONFIG/'updater/config.json')
  expected=before.decode().replace(cfg['origin']+' {',cfg['origin']+' {\n'+routes(cfg,False),1).encode()
  check(digest(before)==official.PROXY_HASHES['live'] and after==expected==(core.CONFIG/'Caddyfile').read_bytes() and cfg==core.read_json(backup/'config.after.json'),'authenticated updater proxy additions')
  self.bundle=bundle
  return {'transition_accepted':True,'production_mutations':False,'source_sha':self.sha,'digest':self.digest,'guards':self.file_guards(),'equivalence':result,'free_disk':shutil.disk_usage(core.ROOT).free}

 def prepare(self,journal):
  self.folder.mkdir(parents=True,mode=0o700,exist_ok=False)
  source=self.folder/'source';source.mkdir(mode=0o755)
  for name,data in self.files.items():
   path=source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);path.chmod(0o644)
  core.atomic_json(source/'release.json',self.manifest)
  core.atomic_json(source/'.hubify-provenance.json',{'source_sha':self.sha,'app_tree':APP_TREE,'archive_sha256':self.digest})
  candidate=copy.deepcopy(journal['old_compose'])
  from update_service.engine import Engine
  for name,target in [('tools','tools'),('app','runtime')]:
   image='single-store-'+name+':hubify-payment-'+self.sha[:12]
   candidate['services'][name].update(image=image,build={'context':str(source/'app'),'target':target})
   Engine(None,{}).build(source,image,target)
  self.prepare_private(candidate,journal)
  candidate['services']['app'].setdefault('environment',{}).update(STORE_INSTALLED_VERSION='1.8.1',STORE_BUILD_SHA=self.sha,STORE_UPDATE_CHANNEL='hubify-development')
  journal['candidate']=candidate
  journal['image']=core.run(['docker','image','inspect','--format','{{.Id}}',candidate['services']['app']['image']])
  core.atomic_json(self.folder/'compose.json',candidate)

 def prepare_private(self,candidate,journal):
  cfg=self.google_client();key_path=self.private/'encryption.key'
  if not key_path.exists(): write_private_once(key_path,base64.b64encode(secrets.token_bytes(32)))
  key=private_file(key_path).decode();check(len(base64.b64decode(key,validate=True))==32,'integration key')
  ids=json.loads(core.sql('''SELECT coalesce(json_agg(DISTINCT u.id),'[]') FROM "User" u JOIN "UserRole" ur ON ur."userId"=u.id JOIN "Role" r ON r.id=ur."roleId" WHERE u."isActive" AND r.name='Admin';'''))
  check(ids and all(re.fullmatch('[A-Za-z0-9_-]{1,100}',i) for i in ids),'enrolled Hubify Admin identities')
  env={'PAYMENT_EVIDENCE_PREVIEW':'true','PAYMENT_GMAIL_OAUTH_TEST':'true','PAYMENT_EVIDENCE_ADMIN_IDS':','.join(sorted(ids)),'PAYMENT_GOOGLE_CLIENT_ID':cfg['client_id'],'PAYMENT_GOOGLE_CLIENT_SECRET':cfg['client_secret'],'PAYMENT_INTEGRATION_ENCRYPTION_KEY':key}
  path=self.private/'pilot-runtime.env'
  write_private_once(path,('\n'.join(k+'='+v for k,v in env.items())+'\n').encode())
  app=candidate['services']['app'];check(not set(env).intersection(app.get('environment',{})),'conflicting application pilot environment')
  previous=app.get('env_file',[]);previous=[previous] if isinstance(previous,str) else list(previous)
  app['env_file']=[*previous,str(path)]
  lines=dict(line.split('=',1) for line in (core.CONFIG/'migration.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
  check('DIRECT_URL' in lines and 'DATABASE_URL' in lines,'migration URLs missing')
  for name in ['DIRECT_URL','DATABASE_URL']: lines[name]=bounded_url(lines[name])
  migration=self.private/'pilot-migration.env'
  write_private_once(migration,('\n'.join(k+'='+v for k,v in lines.items())+'\n').encode())
  check(not set(lines).intersection(candidate['services']['tools'].get('environment',{})),'conflicting tools migration environment')
  candidate['services']['tools']['env_file']=[str(migration)]
  journal['private_files']={str(p):digest(private_file(p)) for p in [key_path,path,migration]}
  journal['enrolled_admin_count']=len(ids)

 def drain(self,journal):
  check(self.file_guards()==journal['guards'],'configuration changed since preflight')
  core.run(['systemctl','stop','single-store-updater.service']);self.worker_idle()
  # Only insert an additional recovery fence in the existing installed engine;
  # never replace the worker with the candidate's broader/different source.
  journal['worker_guard_patch']={}
  for index,path in enumerate([core.ROOT/'updater/update_service/engine.py',core.ROOT/'manager/update_service/engine.py']):
   raw=path.read_bytes();check(digest(raw)==journal['guards'][str(path)] and raw.count(OLD_GUARD)==1,'worker changed before restrictive patch')
   before=self.folder/('previous-worker-engine-'+str(index)+'.py');write_private_once(before,raw)
   fresh=raw.replace(OLD_GUARD,NEW_GUARD)
   compile(fresh,str(path),'exec')
   journal['worker_guard_patch'][str(path)]={'before':digest(raw),'after':digest(fresh)}
   self.save(journal)
   temp=path.with_suffix('.payment-guard-tmp');temp.write_bytes(fresh);temp.chmod(0o644);os.replace(temp,path)
  core.run(['systemctl','stop','single-store-maintenance.timer'])
  deadline=time.monotonic()+180
  while self.active('single-store-maintenance.service'):
   check(time.monotonic()<deadline,'in-flight maintenance; not killed');time.sleep(1)

 def expected_ledger(self,journal): return {**journal['from']['migrations'],**ADDITIONS}

 def data_snapshot(self):
  names=json.loads(core.sql("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations';"))
  result={}
  for name in names:
   if name in TABLES:continue
   check(re.fullmatch('[A-Za-z_][A-Za-z0-9_]*',name) is not None,'table identifier')
   row="encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')"
   result[name]=core.sql('SELECT encode(sha256(convert_to(coalesce(string_agg('+row+",'' ORDER BY "+row+"),''),'UTF8')),'hex') FROM \""+name+'" t;')
  return result

 def migrate(self,journal):
  check(journal.get('backup_verified') and journal.get('backup'),'verified backup required')
  check(self.database_state(journal)=='old','migration baseline changed')
  for p,h in journal['private_files'].items():check(digest(private_file(Path(p)))==h,'private configuration changed')
  core.dc(['run','--rm','-T','--no-deps','--name','single-store-payment-migrate-'+self.sha[:12],'tools','npm','run','db:migrate'],file=self.folder/'compose.json',timeout=180)
  core.grant_runtime()

 def verify_migration(self,journal):
  check(self.database_state(journal)=='new','migration did not finish exactly 30 to 32')
  check([r for r in self.ledger_rows() if r['migration_name'] not in ADDITIONS]==journal['before_ledger'],'historical ledger rows changed')
  check(self.data_snapshot()==journal['before_data'],'existing store/financial rows changed')
  from update_service.native_forward import schema_hash
  check(schema_hash()==AFTER_SCHEMA,'unexpected post-migration schema')
  check(all(core.sql('SELECT count(*) FROM "'+t+'";')=='0' for t in TABLES),'unexpected pilot data before traffic')

 def verify_active(self,journal):
  check(self.database_state(journal)=='new','active schema')
  core.healthy()
  item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
  env=dict(line.split('=',1) for line in item['Config']['Env'] if '=' in line)
  check(item['Image']==journal['image'] and env.get('STORE_BUILD_SHA')==self.sha and env.get('STORE_INSTALLED_VERSION')=='1.8.1','pilot active image/source')
  check({k:env.get(k) for k in official.FLAGS}==self.flags()==journal['flags'],'carrier approvals changed')
  check(env.get('PAYMENT_EVIDENCE_PREVIEW')=='true' and env.get('PAYMENT_GMAIL_OAUTH_TEST')=='true' and bool(env.get('PAYMENT_EVIDENCE_ADMIN_IDS')) and env.get('PAYMENT_PROVIDER','manual')=='manual','pilot flags/manual provider')
  check(env.get('STORE_INSTALLATION_ID')==history.INSTALLATION,'pilot runtime installation identity')
  for p,h in journal['private_files'].items():check(digest(private_file(Path(p)))==h,'private configuration changed')
  for p,h in journal.get('worker_guard_patch',{}).items():check(digest(Path(p).read_bytes())==h['after'],'restrictive worker fence changed')
  import promotions_smoke
  journal['smoke']=promotions_smoke.verify()

 def metadata(self,journal):
  check(self.flags()==journal['flags'],'Production guard changed')
  if not journal.get('traffic_may_have_opened'):self.verify_migration(journal)
  cfg=core.read_json(core.CONFIG/'updater/config.json')
  core.atomic_json(cfg['baseline'],{'root':str(self.folder/'source'),'files':journal['manifest']['files']})
  core.atomic_json(core.CONFIG/'version.json',{**journal['from'],'version':'1.8.1','source_sha':self.sha,'migrations':self.expected_ledger(journal),'channel':'hubify-development','candidate_version':'1.8.1','artifact_sha256':self.digest,'image_digest':journal['image'],'deployment':'hubify-payment-observation-pilot','previous_source_sha':BASE_SHA})

 def external_stopped(self,journal):
  names=core.run(['docker','ps','--format','{{.Names}}']).splitlines()
  check('single-store-payment-migrate-'+self.sha[:12] not in names,'migration container still running')
  phase=journal.get('interrupted_phase',journal['phase'])
  check(phase not in ('build','backup') or getattr(self,'external_work_stopped',False),'uncertain build/backup requires external-work inspection')
