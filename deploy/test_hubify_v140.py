import importlib.util,sys,types,unittest,tempfile,json
from pathlib import Path
from unittest.mock import Mock,patch
class UpgradeSafety(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.core=types.ModuleType('core');self.core.CONFIG=self.root;self.core.COMPOSE=self.root/'compose';self.core.dc=Mock();self.core.healthy=Mock();self.core.atomic_json=Mock();self.core.read_json=Mock();self.core.run=Mock()
  self.updater=types.ModuleType('updater');self.updater.backup=Mock();self.updater.verify_backup=Mock()
  spec=importlib.util.spec_from_file_location('v140',Path(__file__).with_name('hubify-v140.py'));self.module=importlib.util.module_from_spec(spec)
  with patch.dict(sys.modules,{'core':self.core,'updater':self.updater}):spec.loader.exec_module(self.module)
 def tearDown(self):self.temp.cleanup()
 def test_wrong_target_before_docker(self):
  (self.root/'runtime.env').write_text('APP_ORIGIN=https://other.example\n')
  with patch.object(self.module.os,'geteuid',create=True,return_value=0):
   with self.assertRaisesRegex(RuntimeError,'Not Hubify'):self.module.main()
  self.core.dc.assert_not_called();self.updater.backup.assert_not_called()
 def test_rollback_restores_old_compose_and_metadata_without_database_commands(self):
  journal={'old_compose':{'services':{'app':{'image':'previous'}}},'previous':{'version':'1.3.0'}}
  self.module.restore(journal)
  self.core.atomic_json.assert_any_call(self.core.COMPOSE,journal['old_compose'])
  self.core.atomic_json.assert_any_call(self.root/'version.json',journal['previous'])
  self.assertEqual(self.core.dc.call_args.args[0],['up','-d','--no-build','--wait','--wait-timeout','90','app']);self.assertEqual(journal['status'],'rolled-back')
 def test_non_operator_rejected(self):
  with patch.object(self.module.os,'geteuid',create=True,return_value=1000):
   with self.assertRaisesRegex(RuntimeError,'operator'):self.module.main()
  self.core.run.assert_not_called()
if __name__=='__main__':unittest.main()
