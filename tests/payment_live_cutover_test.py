"""Target-specific continuation plus shared durable failure-state contracts."""
import copy,json,os,sys,types,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'installer'))
if os.name!='posix':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
import core,promotions_cutover as official,payment_live_cutover as live
from update_service.payment_live_forward import NEW_NAME,NEW_SQL,AFTER_SCHEMA

class PaymentsLiveCutoverTests(unittest.TestCase):
    def test_exact_source_artifact_and_all33_old_sql(self):
        self.assertEqual(live.Native.base_sha,'ef7b338413b33d05e864deb858ccc75a5269189a')
        self.assertEqual(live.Native.base_digest,'55913f7c81c102db77bef200593c7d8d06d5e921d68a580ca32012e4f5119e6a')
        import promotions_transition as package
        baseline,files=package.package(Path(os.environ['PUBLIC_V182_ARCHIVE']),live.Native.base_digest,live.Native.base_sha,'1.8.2')
        self.assertEqual(len(baseline['migrations']),33)
        for n in baseline['migrations']:
            p='app/prisma/migrations/'+n+'/migration.sql';self.assertEqual(files[p],(ROOT/p).read_bytes())
        self.assertEqual(package.digest((ROOT/'app/prisma/migrations'/NEW_NAME/'migration.sql').read_bytes()),NEW_SQL)
    def test_no_sql_without_backup_and_no_ambiguous_ledger(self):
        d=object.__new__(live.Native)
        with patch('core.dc') as dc:
            with self.assertRaises(core.StoreError):d.migrate({})
            dc.assert_not_called()
        old={'old':'a'};j={'from':{'migrations':old}};row=dict(migration_name='old',checksum='a',finished_at='time',rolled_back_at=None)
        with patch.object(d,'ledger_rows',return_value=[row]):self.assertEqual(d.database_state(j),'old')
        new={**row,'migration_name':NEW_NAME,'checksum':NEW_SQL}
        with patch.object(d,'ledger_rows',return_value=[row,new]):self.assertEqual(d.database_state(j),'new')
        with patch.object(d,'ledger_rows',return_value=[row,{**new,'finished_at':None}]):self.assertEqual(d.database_state(j),'uncertain')
    def test_data_and_history_required_before_opening(self):
        d=object.__new__(live.Native);j={'before_ledger':[{'migration_name':'old'}],'before_data':{'Payment':'stable'}}
        with patch.object(d,'database_state',return_value='new'),patch('payment_live_cutover.schema_hash',return_value=AFTER_SCHEMA),patch.object(d,'ledger_rows',return_value=[{'migration_name':'old'},{'migration_name':NEW_NAME}]),patch.object(d,'data_snapshot',return_value={'Payment':'stable'}):d.verify_migration(j)
        with patch.object(d,'database_state',return_value='new'),patch('payment_live_cutover.schema_hash',return_value=AFTER_SCHEMA),patch.object(d,'ledger_rows',return_value=j['before_ledger']),patch.object(d,'data_snapshot',return_value={'Payment':'changed'}):
            with self.assertRaises(core.StoreError):d.verify_migration(j)
    def test_prepared_images_preserve_production_flags_and_actual_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            d=object.__new__(live.Native);d.folder=Path(folder)/'candidate';d.repository=Path(folder);d.sha='a'*40;d.digest='b'*64;d.files={'app/fixture':b'data'};d.manifest={'source_sha':d.sha};d.prepared_images={'app':'sha256:'+'c'*64,'tools':'sha256:'+'d'*64}
            j={'old_compose':{'services':{'app':{'environment':{k:'yes' for k in official.FLAGS}},'tools':{}}}}
            with patch('core.run',side_effect=lambda args:'e'*40 if args[0]=='git' else d.prepared_images['app']),patch('update_service.engine.Engine.build') as build:d.prepare(j);build.assert_not_called()
            env=j['candidate']['services']['app']['environment'];self.assertEqual({k:env[k] for k in official.FLAGS},{k:'yes' for k in official.FLAGS});self.assertEqual(env['STORE_BUILD_SHA'],d.sha);self.assertEqual(env['STORE_INSTALLED_VERSION'],'1.8.3');self.assertEqual(env['PAYMENT_GOPAY_CHECKOUT_ENABLED'],'true')
    def test_old_code_rollback_uses_official_pre_sql_only_contract(self):
        self.assertIs(live.Native.rollback_before_migration,official.Native.rollback_before_migration)
        # Post-SQL rollback is never selected by the shared orchestrator; the
        # separate fault tests exercise interruption at every external stage.
        source=(ROOT/'installer/promotions_cutover.py').read_text()
        self.assertIn("state == 'old' and not journal.get('migration_started')",source)
    def test_drain_uses_installed_canonical_guard_without_rewriting_worker(self):
        d=object.__new__(live.Native);j={'guards':{'immutable':'same'}}
        with patch.object(d,'file_guards',return_value=j['guards']),patch.object(d,'worker_idle') as idle,patch.object(d,'active',return_value=False),patch('core.run') as run:
            d.drain(j);idle.assert_called_once()
            self.assertEqual(run.call_args_list[0].args[0],['systemctl','stop','single-store-updater.service'])
            self.assertEqual(run.call_args_list[1].args[0],['systemctl','stop','single-store-maintenance.timer'])
        with patch.object(d,'file_guards',return_value={'immutable':'changed'}),patch('core.run') as run:
            with self.assertRaises(core.StoreError):d.drain(j)
            run.assert_not_called()
if __name__=='__main__':unittest.main()
