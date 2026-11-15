"""Authenticated public baseline and schema33 adapter regression tests."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'installer'))
if os.name!='posix':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
from update_service import blu_forward as blu
from update_service.evidence_forward import BASE_SOURCE,BASE_TREE,BASE_SCHEMA,NEW_NAME,NEW_SQL,adapter
from update_service.native_forward import NativeForward
from update_service.trust import Rejected

class BluAdapterTests(unittest.TestCase):
    def setUp(self):
        self.manifest=json.loads(Path(os.environ['PUBLIC_V181_MANIFEST']).read_text())
        self.policy=dict(format=2,executor=blu.EXECUTOR,fromVersion='1.8.1',toVersion='1.8.2',
            fromSourceSha=BASE_SOURCE,baselineAppTree=BASE_TREE,baselineSchemaHash=BASE_SCHEMA,
            baselineFiles={k:v for k,v in self.manifest['files'].items() if k.startswith('app/')},
            beforeMigrations=self.manifest['migrations'],afterMigrations={**self.manifest['migrations'],**blu.ADDITIONS})
    def test_exact_31_historical_files_and_two_additions(self):
        blu.reviewed_policy(self.policy)
        self.assertEqual(len(self.policy['afterMigrations']),33)
        for name,sha in self.policy['afterMigrations'].items():
            self.assertEqual(hashlib.sha256((ROOT/'app/prisma/migrations'/name/'migration.sql').read_bytes()).hexdigest(),sha)
    def test_each_missing_modified_or_foreign_sql_rejected(self):
        for name in self.policy['afterMigrations']:
            value=copy.deepcopy(self.policy);value['afterMigrations'][name]='f'*64
            with self.subTest(name=name),self.assertRaises(Rejected):blu.reviewed_policy(value)
        for key in ('fromSourceSha','baselineSchemaHash','baselineAppTree'):
            with self.subTest(key=key),self.assertRaises(Rejected):blu.reviewed_policy({**self.policy,key:'f'*64})
        value=copy.deepcopy(self.policy);del value['afterMigrations'][blu.ACTIVATION_NAME]
        with self.assertRaises(Rejected):blu.reviewed_policy(value)
    def test_recovery_selects_exact_same_adapter(self):
        engine=types.SimpleNamespace(config={'jobs':'/unused'})
        job={'id':'fixture','release':json.dumps({'sha':'a'*40,'digest':'b'*64})}
        self.assertIsInstance(adapter(engine,job,self.policy),blu.BluCheckoutForward)
        with patch('pathlib.Path.exists',return_value=True),patch('core.read_json',return_value={'policy':self.policy}):
            self.assertIsInstance(adapter(engine,job),blu.BluCheckoutForward)
    def test_readiness_distinguishes_initial_activation_from_owner_opt_in(self):
        driver=object.__new__(blu.BluCheckoutForward)
        with patch.object(NativeForward,'verify_active'),patch('update_service.blu_forward.schema_hash',return_value=blu.AFTER_SCHEMA),patch('core.sql',return_value='1'):
            with self.assertRaisesRegex(Rejected,'unexpected_payment_activation'):driver.verify_active({})
            driver.verify_active({'traffic_may_have_opened':True})
        with patch.object(NativeForward,'verify_active'),patch('update_service.blu_forward.schema_hash',return_value='f'*64):
            with self.assertRaisesRegex(Rejected,'schema_drift'):driver.verify_active({'traffic_may_have_opened':True})
    def test_all_six_private_cutover_intents_block_worker(self):
        import tempfile
        from update_service.engine import operator_cutover_guard
        with tempfile.TemporaryDirectory() as folder,patch('core.CONFIG',Path(folder)):
            p=Path(folder)/'hubify-blu-checkout-cutover.json'
            for phase in ('initial','prepare_done','migration','recovery_required'):
                p.write_text(json.dumps({'phase':phase}))
                with self.assertRaisesRegex(Rejected,'operator_cutover_in_progress'):operator_cutover_guard()
            p.write_text(json.dumps({'phase':'complete'}));operator_cutover_guard()

if __name__=='__main__':unittest.main()
