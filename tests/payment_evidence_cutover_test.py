"""Exact pilot transition and failure contracts. All inputs are synthetic/source SQL."""
import base64,copy,hashlib,json,os
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'installer'))
import core,payment_evidence_cutover as pilot,promotions_cutover as official

def fixture():
 files={p.relative_to(ROOT).as_posix():p.read_bytes() for p in (ROOT/'app/prisma/migrations').glob('*/migration.sql') if p.parent.name not in pilot.ADDITIONS}
 old={'migrations':{Path(p).parent.name:pilot.digest(v) for p,v in files.items()}}
 expected=dict(old['migrations']);historical={}
 for name,(raw_hash,canonical) in pilot.history.PAIRS.items():
  data=files['app/prisma/migrations/'+name+'/migration.sql']
  # Reconstruct the exact public historical mixed-ending bytes in memory.
  endings=set([*range(18),19] if name.endswith('order_resolution_workflow') else [0,1])
  raw=b''.join(line[:-1]+b'\r\n' if i in endings and line.endswith(b'\n') else line for i,line in enumerate(data.splitlines(keepends=True)))
  assert pilot.digest(raw)==raw_hash
  expected[name]=raw_hash
  historical[name]={'original':{'base64':base64.b64encode(raw).decode()},'active':{'base64':base64.b64encode(data).decode()}}
 new_files=copy.deepcopy(files)
 for name in pilot.ADDITIONS:new_files['app/prisma/migrations/'+name+'/migration.sql']=(ROOT/'app/prisma/migrations'/name/'migration.sql').read_bytes()
 new_files['release-policy.json']=(ROOT/'release-policy.json').read_bytes()
 new={'migrations':{**old['migrations'],**pilot.ADDITIONS},'compatibility':json.loads(new_files['release-policy.json'])}
 schema={'columns':[],'constraints':[],'indexes':[],'rls':[]}
 bundle={'context':{'installation':pilot.history.INSTALLATION,'origin':'https://hubify.web.id'},'schema':schema,
 'runtime':{p:{'sha256':pilot.digest(data)} for p,data in files.items()},
 'observation':{'version':{'version':'1.8.0','source_sha':pilot.BASE_SHA,'artifact_sha256':pilot.BASE_DIGEST,'image_digest':pilot.BASE_IMAGE,'db_contract':1,'migrations':expected},'source_commit':pilot.BASE_SHA,'app_tree':pilot.BASE_TREE,'source_inventory':old['migrations'],'containers':[{'service':'app','image':pilot.BASE_IMAGE,'running':True,'health':'healthy'}],'historical_files':historical,'database':{'ledger':[{'migration_name':n,'checksum':h,'finished':True,'rolled_back':False} for n,h in expected.items()]},'app_environment':{**{k:'yes' for k in official.FLAGS},'STORE_BUILD_SHA':pilot.BASE_SHA,'STORE_INSTALLED_VERSION':'1.8.0'}}}
 return bundle,(old,files),(new,new_files)

class TransitionTests(unittest.TestCase):
 def setUp(self):
  self.bundle,self.old,self.new=fixture()
  self.schema_patch=patch.object(pilot,'BEFORE_SCHEMA',pilot.digest(json.dumps(self.bundle['schema'],sort_keys=True,separators=(',',':')).encode()))
  self.schema_patch.start();self.addCleanup(self.schema_patch.stop)
 def review(self):return pilot.review(self.bundle,self.old,self.new)
 def test_accepts_exact_edge_without_mutation(self):
  before=copy.deepcopy((self.bundle,self.old,self.new));self.assertTrue(self.review()['historical_ledger_preserved']);self.assertEqual(before,(self.bundle,self.old,self.new))
 def test_wrong_tenant_rejected(self):
  self.bundle['context']['installation']='other-store'
  with self.assertRaises(core.StoreError):self.review()
 def test_wrong_origin_rejected(self):
  self.bundle['context']['origin']='https://other.example'
  with self.assertRaises(core.StoreError):self.review()
 def test_metadata_identities_rejected(self):
  for key,value in [('version','1.7.4'),('source_sha','a'*40),('artifact_sha256','b'*64),('image_digest','wrong'),('db_contract',2)]:
   b=copy.deepcopy(self.bundle);self.bundle['observation']['version'][key]=value
   with self.assertRaises(core.StoreError):self.review()
   self.bundle=b
 def test_source_tree_inventory_rejected(self):
  for key in ['source_commit','app_tree','source_inventory']:
   b=copy.deepcopy(self.bundle);self.bundle['observation'][key]='wrong'
   with self.assertRaises(core.StoreError):self.review()
   self.bundle=b
 def test_unhealthy_or_different_running_image_rejected(self):
  for key,value in [('image','other'),('running',False),('health','unhealthy')]:
   b=copy.deepcopy(self.bundle);self.bundle['observation']['containers'][0][key]=value
   with self.assertRaises(core.StoreError):self.review()
   self.bundle=b
 def test_missing_runtime_or_customization_rejected(self):
  key=next(iter(self.bundle['runtime']));self.bundle['runtime'][key]['sha256']='wrong'
  with self.assertRaises(core.StoreError):self.review()
 def test_schema_drift_rejected(self):
  self.bundle['schema']['columns'].append({'unexpected':True})
  with self.assertRaises(core.StoreError):self.review()
 def test_duplicate_unfinished_rolledback_ledger_rejected(self):
  for change in ['duplicate','unfinished','rolledback','checksum']:
   b=copy.deepcopy(self.bundle);rows=self.bundle['observation']['database']['ledger']
   if change=='duplicate':rows.append(rows[0])
   if change=='unfinished':rows[0]['finished']=False
   if change=='rolledback':rows[0]['rolled_back']=True
   if change=='checksum':rows[0]['checksum']='wrong'
   with self.assertRaises(core.StoreError):self.review()
   self.bundle=b
 def test_historical_substantive_change_rejected(self):
  record=next(iter(self.bundle['observation']['historical_files'].values()))
  record['original']['base64']=base64.b64encode(b'changed SQL').decode()
  with self.assertRaises(core.StoreError):self.review()
 def test_extra_or_changed_new_migration_rejected(self):
  self.new[0]['migrations']['extra']='fake'
  with self.assertRaises(core.StoreError):self.review()
 def test_candidate_cannot_rewrite_old_sql(self):
  self.new[1][next(iter(self.old[1]))]=b'changed'
  with self.assertRaises(core.StoreError):self.review()
 def test_jnt_approvals_not_disabled_to_pass(self):
  for flag in official.FLAGS:
   self.bundle['observation']['app_environment'][flag]='no'
   with self.assertRaises(core.StoreError):self.review()
   self.bundle['observation']['app_environment'][flag]='yes'
 def test_source_guards_not_bypassed(self):
  text=(ROOT/'staging/hubify-staging-deploy.py').read_text()
  self.assertIn('J&T Production tidak boleh diaktifkan di staging.',text)
  self.assertIn("'source is not current merged main'",(ROOT/'deploy/hubify-promotions-cutover.py').read_text())
  self.assertIn("expected_tree=TARGET_TREE",(ROOT/'installer/promotions_cutover.py').read_text())

class DriverContracts(unittest.TestCase):
 def test_new_edge_uses_same_durable_engine(self):
  self.assertIs(pilot.official.Cutover,official.Cutover)
 def test_expected_ledger_preserves_original_hashes(self):
  d=object.__new__(pilot.Native);self.assertEqual(d.expected_ledger({'from':{'migrations':{'old':'digest'}}}),{'old':'digest',**pilot.ADDITIONS})
 def test_old_proxy_policy_stays_pinned_and_new_edge_uses_reviewed_worker_routes(self):
  self.assertEqual(official.Native.proxy_hashes,official.PROXY_HASHES)
  self.assertNotEqual(pilot.Native.proxy_hashes,official.Native.proxy_hashes)
  self.assertEqual(pilot.Native.proxy_hashes['live'],'ac63c99445a588136f2b451080b7d17f2223d9e7086b6f93b061044e84d56cc7')
 def test_migration_requires_verified_backup(self):
  d=object.__new__(pilot.Native)
  with self.assertRaises(core.StoreError):d.migrate({'backup_verified':False})
 def test_partial_ledger_never_repeats_sql(self):
  d=object.__new__(pilot.Native)
  with patch.object(d,'database_state',return_value='uncertain'),patch.object(core,'dc') as call:
   with self.assertRaises(core.StoreError):d.migrate({'backup_verified':True,'backup':'fixture'})
   call.assert_not_called()
 def test_private_configuration_conflict_not_overwritten(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'private.env';path.write_bytes(b'old')
   with patch.object(pilot,'private_file',return_value=b'old'):
    with self.assertRaises(core.StoreError):pilot.write_private_once(path,b'new')
   self.assertEqual(path.read_bytes(),b'old')
 def test_timeouts_are_migration_only_and_wrong_endpoints_refused(self):
  from urllib.parse import parse_qs,urlsplit
  result=pilot.bounded_url('postgresql://fixture:fixture@db:5432/store?schema=public')
  self.assertEqual(parse_qs(urlsplit(result).query)['options'],['-c lock_timeout=10000 -c statement_timeout=90000'])
  for url in ['postgresql://user@other:5432/store','postgresql://user@db/other','postgresql://user@db/store?options=custom']:
   with self.assertRaises(core.StoreError):pilot.bounded_url(url)
 def test_restrictive_patch_preserves_all_other_worker_bytes(self):
  before=b'unchanged\ndef operator_cutover_guard():\n'+pilot.OLD_GUARD+b'\nrest'
  after=before.replace(pilot.OLD_GUARD,pilot.NEW_GUARD)
  self.assertIn(b'hubify-payment-evidence-cutover.json',after)
  self.assertEqual(after.replace(pilot.NEW_GUARD,pilot.OLD_GUARD),before)
 def test_installed_extra_guard_blocks_new_and_original_recovery_intents(self):
  class Denied(Exception):pass
  namespace={'core':core,'Rejected':Denied}
  exec(compile(b'def guard():\n'+pilot.NEW_GUARD+b'\n','fixture','exec'),namespace)
  with tempfile.TemporaryDirectory() as folder,patch.object(core,'CONFIG',Path(folder)):
   for name in ['hubify-promotions-cutover.json','hubify-payment-evidence-cutover.json']:
    path=Path(folder)/name
    for phase in ['migration','recovery_required','opening_done']:
     path.write_text(json.dumps({'phase':phase}))
     with self.assertRaises(Denied):namespace['guard']()
    path.write_text(json.dumps({'phase':'complete'}));namespace['guard']()
 def test_migration_verification_detects_old_data_change(self):
  d=object.__new__(pilot.Native)
  with patch.object(d,'database_state',return_value='new'),patch.object(d,'ledger_rows',return_value=[]),patch.object(d,'data_snapshot',return_value={'old':'changed'}):
   with self.assertRaises(core.StoreError):d.verify_migration({'before_ledger':[],'before_data':{'old':'original'}})
 def test_migration_verification_detects_old_ledger_change(self):
  d=object.__new__(pilot.Native)
  with patch.object(d,'database_state',return_value='new'),patch.object(d,'ledger_rows',return_value=[{'migration_name':'old','checksum':'changed'}]):
   with self.assertRaises(core.StoreError):d.verify_migration({'before_ledger':[{'migration_name':'old','checksum':'original'}]})
 def test_schema_and_data_checks_run_before_opening(self):
  text=(ROOT/'installer/payment_evidence_cutover.py').read_text()
  self.assertIn("schema_hash()==AFTER_SCHEMA",text)
  self.assertIn("self.data_snapshot()==journal['before_data']",text)
  self.assertNotIn('migrate resolve',text)

if __name__=='__main__':unittest.main()
