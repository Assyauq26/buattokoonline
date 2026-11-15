import copy,hashlib,json,os,sys,types,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'installer'))
if os.name!='posix':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
from update_service import payment_live_forward as live
from update_service.evidence_forward import adapter
from update_service.trust import Rejected
from update_service.native_forward import NativeForward
import promotions_transition as package
class PaymentLiveTests(unittest.TestCase):
    def setUp(self):
        archive=Path(os.environ['PUBLIC_V182_ARCHIVE'])
        manifest,files=package.package(archive,live.BASE_ARCHIVE,live.BASE_SOURCE,'1.8.2')
        self.policy=dict(format=2,executor=live.EXECUTOR,fromVersion='1.8.2',toVersion='1.8.3',fromSourceSha=live.BASE_SOURCE,
          baselineAppTree=live.BASE_TREE,baselineSchemaHash=live.BASE_SCHEMA,baselineFiles={n:package.digest(b) for n,b in files.items() if n.startswith('app/')},
          beforeMigrations=manifest['migrations'],afterMigrations={**manifest['migrations'],live.NEW_NAME:live.NEW_SQL})
    def test_actual_public_archive_and_all_historical_bytes(self):
        live.reviewed_policy(self.policy)
        for name,digest in self.policy['afterMigrations'].items():self.assertEqual(hashlib.sha256((ROOT/'app/prisma/migrations'/name/'migration.sql').read_bytes()).hexdigest(),digest)
    def test_changed_baseline_sql_or_file_inventory_rejected(self):
        for field in ('baselineAppTree','baselineSchemaHash','fromSourceSha'):
            with self.subTest(field=field),self.assertRaises(Rejected):live.reviewed_policy({**self.policy,field:'f'*64})
        for name in self.policy['afterMigrations']:
            p=copy.deepcopy(self.policy);p['afterMigrations'][name]='f'*64
            with self.subTest(migration=name),self.assertRaises(Rejected):live.reviewed_policy(p)
        p=copy.deepcopy(self.policy);p['baselineFiles']['app/Dockerfile']='f'*64
        with self.assertRaises(Rejected):live.reviewed_policy(p)
    def test_recovery_selects_persisted_exact_executor(self):
        engine=types.SimpleNamespace(config={'jobs':'/unused'});job={'id':'fixture','release':json.dumps({'sha':'a'*40,'digest':'b'*64})}
        self.assertIsInstance(adapter(engine,job,self.policy),live.PaymentLiveForward)
        with patch('pathlib.Path.exists',return_value=True),patch('core.read_json',return_value={'policy':self.policy}):self.assertIsInstance(adapter(engine,job),live.PaymentLiveForward)
    def test_after_schema_required_without_requiring_existing_accounts_disabled(self):
        d=object.__new__(live.PaymentLiveForward)
        with patch.object(NativeForward,'verify_active'),patch('update_service.payment_live_forward.schema_hash',return_value=live.AFTER_SCHEMA):d.verify_active({})
        with patch.object(NativeForward,'verify_active'),patch('update_service.payment_live_forward.schema_hash',return_value='f'*64):
            with self.assertRaisesRegex(Rejected,'schema_drift'):d.verify_active({})
    def test_seventh_guard_blocks_parallel_or_interrupted_private_cutover(self):
        import tempfile
        from update_service.engine import operator_cutover_guard
        with tempfile.TemporaryDirectory() as folder,patch('core.CONFIG',Path(folder)):
            p=Path(folder)/'hubify-payment-live-cutover.json'
            for phase in ('preparing','migration','activation','recovery_required'):
                p.write_text(json.dumps({'phase':phase}))
                with self.assertRaisesRegex(Rejected,'operator_cutover_in_progress'):operator_cutover_guard()
            for phase in ('complete','rolled_back'):p.write_text(json.dumps({'phase':phase}));operator_cutover_guard()
if __name__=='__main__':unittest.main()
