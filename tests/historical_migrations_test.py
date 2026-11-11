import copy,hashlib,sys,tempfile,unittest,json,tarfile,io
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
import core
import historical_migrations as h
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures/historical-eol'
ARCHIVE=FIX/'store-v1.7.2.tar.gz'
class HistoricalCompatibilityTests(unittest.TestCase):
 def setUp(self):
  self.context={'installation':h.INSTALLATION,'origin':'https://hubify.web.id'}
  with tarfile.open(ARCHIVE) as tar: history=json.load(tar.extractfile('release.json'))['migrations']
  history.update({n:p[0] for n,p in h.PAIRS.items()})
  self.installed={'version':'1.7.2','source_sha':h.BASE_SHA,'db_contract':1,'migrations':history}
 def material(self,n):
  old=(FIX/(n+'.bin')).read_bytes();new=(ROOT/'app/prisma/migrations'/n/'migration.sql').read_bytes();return old,new
 def check(self,n,old,new,installed=None,context=None,archive=ARCHIVE,target='1.7.3'):
  return h.authorize(n,old,new,installed or self.installed,context or self.context,archive,target)
 def test_positive_exact_pairs_preserve_inputs_and_idempotence(self):
  snapshot=copy.deepcopy(self.installed)
  for n in h.PAIRS:
   old,new=self.material(n);before=(old,new)
   self.assertEqual(old.replace(b'\r\n',b'\n'),new)
   self.assertEqual(self.check(n,old,new),self.check(n,old,new))
   self.assertEqual((old,new),before)
  self.assertEqual(self.installed,snapshot)
 def test_negative_sql_and_whitespace_mutations(self):
  for n in h.PAIRS:
   old,new=self.material(n)
   variants=[new.replace(b'ALTER',b'DROP',1),new.replace(b'OrderResolution',b'OrderResolutioX',1),new+b'\nSELECT 1;',new.split(b'\n',1)[1],new+b' ',new+b'\r',new.replace(b'\n',b'\r\n',1),new.replace(b' ',b'  ',1)]
   for altered in variants:
    with self.subTest(n=n,change=hashlib.sha256(altered).hexdigest()),self.assertRaises(core.StoreError):self.check(n,old,altered)
 def test_negative_identity_history_version_contract_and_pair(self):
  n=next(iter(h.PAIRS));old,new=self.material(n)
  for field,value in [('version','1.6.3'),('source_sha','a'*40),('db_contract',2),('migrations',{})]:
   installed={**self.installed,field:value}
   with self.subTest(field=field),self.assertRaises(core.StoreError):self.check(n,old,new,installed=installed)
  for context in [dict(self.context,installation='a'*32),dict(self.context,origin='https://other.example')]:
   with self.assertRaises(core.StoreError):self.check(n,old,new,context=context)
  for target in ['1.7.1','1.7.2','1.7.4']:
   with self.assertRaises(core.StoreError):self.check(n,old,new,target=target)
  for name in ['unknown',n+'x']:
   with self.assertRaises(core.StoreError):self.check(name,old,new)
  with self.assertRaises(core.StoreError):self.check(n,old+b' ',new)
 def test_negative_archive_manifest_tampering(self):
  n=next(iter(h.PAIRS));old,new=self.material(n)
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'changed.tar.gz';path.write_bytes(ARCHIVE.read_bytes()+b'changed')
   with self.assertRaises(core.StoreError):self.check(n,old,new,archive=path)
 def test_missing_unknown_and_strict_source_validation(self):
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)
   for migrations in [{},dict(self.installed['migrations'],unknown='a'*64)]:
    installed={**self.installed,'migrations':migrations}
    with patch.object(core,'inventory',return_value=migrations):
     self.assertEqual(h.validate_source(source,installed),(migrations,[]))
   for inventory in [{},dict(self.installed['migrations'],**{next(iter(h.PAIRS)):'b'*64})]:
    with patch.object(core,'inventory',return_value=inventory),self.assertRaises(core.StoreError):h.validate_source(source,self.installed)
 def test_ledger_duplicate_and_partial_rejected(self):
  import importlib.util
  spec=importlib.util.spec_from_file_location('helper',ROOT/'staging/hubify-staging-deploy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  for rows,count in [('[{"name":"x","checksum":"a"},{"name":"x","checksum":"a"}]','0'),('[]','1')]:
   with patch.object(core,'sql',side_effect=[rows,count]),self.assertRaises(core.StoreError):m.read_db_inventory()
 def test_authenticated_package_effective_inventory_preserves_history(self):
  from update_service.package import extract
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);baseline=root/'baseline';destination=root/'destination';destination.mkdir()
   with tarfile.open(ARCHIVE) as tar:
    files={m.name:tar.extractfile(m).read() for m in tar.getmembers()}
   manifest=json.loads(files.pop('release.json'));manifest.update(version='1.7.3',tag='v1.7.3',source_sha='c'*40)
   files['VERSION']=b'1.7.3\n';manifest['files']['VERSION']=h.digest(files['VERSION'])
   manifest['compatibility'].update(minimum_installed_version='1.7.2',maximum_installed_version='1.7.2')
   package=root/'candidate.tar.gz'
   with tarfile.open(package,'w:gz') as tar:
    for name,data in dict(files,**{'release.json':json.dumps(manifest).encode()}).items():
     info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;tar.addfile(info,io.BytesIO(data))
   baseline_files={}
   for n in h.PAIRS:
    old,new=self.material(n);relative='app/prisma/migrations/'+n+'/migration.sql';path=baseline/relative;path.parent.mkdir(parents=True);path.write_bytes(old);baseline_files[relative]=h.digest(old)
   rules={n:{'installed':p[0],'artifact':p[1]} for n,p in h.PAIRS.items()}
   (root/'rules.json').write_text(json.dumps(rules));(root/'baseline.json').write_text(json.dumps({'root':str(baseline),'files':baseline_files}))
   evidence=root/'migration-compatibility/v1.7.2.tar.gz';evidence.parent.mkdir();evidence.write_bytes(ARCHIVE.read_bytes())
   config=dict(self.context,migrationCompatibility=str(root/'rules.json'),baseline=str(root/'baseline.json'))
   before=copy.deepcopy(self.installed);package_hash=h.digest(package.read_bytes())
   with patch.object(core,'CONFIG',root),patch.object(core,'sql') as sql:
    result=extract(package,destination,{'version':'1.7.3','sha':'c'*40},self.installed,config)
    sql.assert_not_called()
   self.assertEqual(result['migrations'],self.installed['migrations']);self.assertEqual(self.installed,before)
   self.assertEqual(h.digest(package.read_bytes()),package_hash)
   for n in h.PAIRS:
    relative='app/prisma/migrations/'+n+'/migration.sql';self.assertEqual((destination/relative).read_bytes(),(baseline/relative).read_bytes())
 def test_runtime_projection_is_confined_and_idempotent(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);source=root/'staging-sources/candidate';source.mkdir(parents=True)
   with tarfile.open(ARCHIVE) as tar:
    for member in tar.getmembers():
     if member.name.startswith('app/prisma/migrations/') and member.name.endswith('/migration.sql'):
      target=source/member.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(member).read())
   (source/'VERSION').write_text('1.7.3')
   evidence=root/'config/migration-compatibility/v1.7.2.tar.gz';evidence.parent.mkdir(parents=True);evidence.write_bytes(ARCHIVE.read_bytes())
   for n in h.PAIRS:
    old,new=self.material(n);original=root/'development-sources'/h.BASE_SHA/'app/prisma/migrations'/n/'migration.sql';original.parent.mkdir(parents=True);original.write_bytes(old)
   with patch.object(core,'ROOT',root),patch.object(core,'CONFIG',root/'config'),patch.object(h,'runtime_context',return_value=self.context):
    with self.assertRaises(core.StoreError):h.prepare_runtime_projection(root/'development-sources'/h.BASE_SHA,self.installed)
    self.assertEqual(len(h.prepare_runtime_projection(source,self.installed)),2)
    self.assertEqual(h.prepare_runtime_projection(source,self.installed),[])
    self.assertEqual(core.inventory(source),self.installed['migrations'])
   for n in h.PAIRS:
    self.assertEqual((root/'development-sources'/h.BASE_SHA/'app/prisma/migrations'/n/'migration.sql').read_bytes(),self.material(n)[0])
 def ui_installed(self):
  return dict(self.installed,version='1.7.3',source_sha=h.V173_UI_BASE_SHA,
              channel='hubify-staging',candidate_version='1.7.3')
 def test_ui_redeploy_exact_pairs_and_tree_preserve_inputs_without_sql(self):
  installed=self.ui_installed();before=copy.deepcopy(installed)
  with patch.object(core,'sql') as sql:
   for name in h.PAIRS:
    old,fresh=self.material(name)
    result=h.authorize(name,old,fresh,installed,self.context,ARCHIVE,
                       source_app_tree=h.V173_UI_APP_TREE)
    self.assertEqual(result['installed'],h.PAIRS[name][0])
    self.assertEqual(result['application_tree'],h.V173_UI_APP_TREE)
    self.assertEqual(result['installed_source'],h.V173_UI_BASE_SHA)
   sql.assert_not_called()
  self.assertEqual(installed,before)
 def test_ui_redeploy_rejects_missing_or_unreviewed_tree_including_updater_calls(self):
  name=next(iter(h.PAIRS));old,fresh=self.material(name)
  for tree in [None,'','a'*40,h.V173_UI_APP_TREE+'x']:
   with self.subTest(tree=tree),self.assertRaises(core.StoreError):
    h.authorize(name,old,fresh,self.ui_installed(),self.context,ARCHIVE,source_app_tree=tree)
 def test_ui_redeploy_rejects_other_metadata_context_versions_and_history(self):
  name=next(iter(h.PAIRS));old,fresh=self.material(name);installed=self.ui_installed()
  changes=[('version','1.7.4'),('source_sha','a'*40),('channel','stable'),
           ('candidate_version',None),('db_contract',2),('migrations',{}),
           ('migrations',dict(installed['migrations'],unexpected='a'*64))]
  for key,value in changes:
   with self.subTest(key=key,value=value),self.assertRaises(core.StoreError):
    h.authorize(name,old,fresh,dict(installed,**{key:value}),self.context,ARCHIVE,
                source_app_tree=h.V173_UI_APP_TREE)
  for context in [dict(self.context,installation='a'*32),dict(self.context,origin='https://other.example')]:
   with self.assertRaises(core.StoreError):
    h.authorize(name,old,fresh,installed,context,ARCHIVE,source_app_tree=h.V173_UI_APP_TREE)
  for target in ['1.7.2','1.7.4']:
   with self.assertRaises(core.StoreError):
    h.authorize(name,old,fresh,installed,self.context,ARCHIVE,target,h.V173_UI_APP_TREE)
 def test_ui_redeploy_rejects_sql_whitespace_and_archive_changes(self):
  name=next(iter(h.PAIRS));old,fresh=self.material(name)
  for changed in [fresh+b' ',fresh.replace(b'ALTER',b'DROP',1),fresh.replace(b' ',b'  ',1),fresh+b'\nSELECT 1;']:
   with self.assertRaises(core.StoreError):
    h.authorize(name,old,changed,self.ui_installed(),self.context,ARCHIVE,
                source_app_tree=h.V173_UI_APP_TREE)
  with tempfile.TemporaryDirectory() as directory:
   archive=Path(directory)/'changed.tar.gz';archive.write_bytes(ARCHIVE.read_bytes()+b'changed')
   with self.assertRaises(core.StoreError):
    h.authorize(name,old,fresh,self.ui_installed(),self.context,archive,
                source_app_tree=h.V173_UI_APP_TREE)
 def test_ui_runtime_projection_stays_confined_idempotent_and_ledger_readonly(self):
  self.installed=self.ui_installed()
  with patch.object(core,'run',return_value=h.V173_UI_APP_TREE) as git,patch.object(core,'sql') as sql:
   self.test_runtime_projection_is_confined_and_idempotent()
   self.assertEqual(git.call_count,1)
   self.assertEqual(git.call_args.args[0][0],'git')
   self.assertEqual(git.call_args.args[0][-3:],['rev-parse','--verify','HEAD:app'])
   sql.assert_not_called()
 def test_ui_runtime_projection_rejects_git_tree_mismatch(self):
  self.installed=self.ui_installed()
  with patch.object(core,'run',return_value='a'*40),self.assertRaises(core.StoreError):
   self.test_runtime_projection_is_confined_and_idempotent()
if __name__=='__main__':unittest.main()
