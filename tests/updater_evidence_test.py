"""Exact public asset/SQL identity and fail-closed adapter regression tests.

PUBLIC_V181_MANIFEST points to release.json extracted from the authenticated
483e43b4... public archive. Nothing here contacts or mutates a store.
"""
import copy
import hashlib
import base64
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'installer'))
if os.name != 'posix':
    sys.modules.setdefault('fcntl', types.SimpleNamespace(LOCK_EX=1, LOCK_NB=2, flock=lambda *a: None))
from update_service.evidence_forward import (EvidenceForward, adapter, reviewed_policy,
    EXECUTOR, BASE_SOURCE, BASE_TREE, BASE_SCHEMA, AFTER_SCHEMA, NEW_NAME, NEW_SQL)
from update_service.native_forward import NativeForward
from update_service.trust import Rejected


class EvidenceAdapterTests(unittest.TestCase):
    def setUp(self):
        asset = os.environ.get('PUBLIC_V181_MANIFEST')
        if not asset:
            self.fail('authenticated public v1.8.1 manifest is required; never substitute synthetic hashes')
        self.manifest = json.loads(Path(asset).read_text())
        self.policy = dict(format=2, executor=EXECUTOR, fromVersion='1.8.1', toVersion='1.8.2',
            fromSourceSha=BASE_SOURCE, baselineAppTree=BASE_TREE, baselineSchemaHash=BASE_SCHEMA,
            baselineFiles={k:v for k,v in self.manifest['files'].items() if k.startswith('app/')},
            beforeMigrations=self.manifest['migrations'],
            afterMigrations={**self.manifest['migrations'], NEW_NAME:NEW_SQL})

    def test_actual_public_manifest_and_all_31_historical_sql(self):
        self.assertEqual(self.manifest['source_sha'], BASE_SOURCE)
        reviewed_policy(self.policy)
        root = Path(__file__).resolve().parents[1]
        for name, digest in self.manifest['migrations'].items():
            self.assertEqual(hashlib.sha256((root/'app/prisma/migrations'/name/'migration.sql').read_bytes()).hexdigest(), digest)
        self.assertEqual(hashlib.sha256((root/'app/prisma/migrations'/NEW_NAME/'migration.sql').read_bytes()).hexdigest(), NEW_SQL)

    def test_wrong_baseline_artifact_tree_schema_or_version_rejects(self):
        for key, value in [('fromSourceSha','f'*40), ('baselineAppTree','f'*40),
                           ('baselineSchemaHash','f'*64), ('fromVersion','1.8.0'), ('toVersion','1.8.3'),
                           ('executor','forward-cutover-v1'), ('format',1)]:
            with self.subTest(key=key), self.assertRaises(Rejected):
                reviewed_policy({**self.policy, key:value})

    def test_partial_or_modified_baseline_file_inventory_rejects(self):
        for operation in ('remove','change','add'):
            p=copy.deepcopy(self.policy); name=next(iter(p['baselineFiles']))
            if operation=='remove':del p['baselineFiles'][name]
            if operation=='change':p['baselineFiles'][name]='f'*64
            if operation=='add':p['baselineFiles']['app/foreign']='f'*64
            with self.subTest(operation=operation), self.assertRaises(Rejected):reviewed_policy(p)

    def test_historical_or_new_sql_change_rejects(self):
        for operation in ('old','new','extra','missing'):
            p=copy.deepcopy(self.policy)
            if operation=='old':p['beforeMigrations'][next(iter(p['beforeMigrations']))]='f'*64
            if operation=='new':p['afterMigrations'][NEW_NAME]='f'*64
            if operation=='extra':p['afterMigrations']['20261115000000_other']='f'*64
            if operation=='missing':del p['afterMigrations'][NEW_NAME]
            with self.subTest(operation=operation), self.assertRaises(Rejected):reviewed_policy(p)

    def test_controller_apply_and_recovery_select_same_adapter(self):
        e=types.SimpleNamespace(config={'jobs':'/unused'})
        job={'id':'fixture','release':json.dumps({'sha':'a'*40,'digest':'b'*64})}
        self.assertIsInstance(adapter(e,job,self.policy),EvidenceForward)
        self.assertIs(type(adapter(e,job,{'executor':'forward-cutover-v1'})),NativeForward)
        with patch('pathlib.Path.exists',return_value=True),patch('core.read_json',return_value={'policy':self.policy}):
            self.assertIsInstance(adapter(e,job),EvidenceForward)
        with self.assertRaises(Rejected):adapter(e,job,{'executor':'unreviewed'})

    def test_new_adapter_keeps_all_legacy_financial_columns(self):
        self.assertEqual(EvidenceForward.snapshot_omit,{})
        self.assertEqual(EvidenceForward.before_count,31)
        self.assertEqual(EvidenceForward.after_schema,AFTER_SCHEMA)
        self.assertEqual(NativeForward.before_count,29)
        self.assertEqual(NativeForward.new_tables,('FlashSaleSkuOffer',))

    def test_snapshot_excludes_only_new_tables_and_hashes_all_existing_columns(self):
        d=object.__new__(EvidenceForward)
        calls=[]
        def sql(query):
            calls.append(query)
            return json.dumps(['OrderItem','FlashSaleCampaign','Payment','PaymentEvidenceSource']) if len(calls)==1 else '0:'
        with patch('core.sql',side_effect=sql):result=d.data_snapshot()
        self.assertEqual(set(result),{'OrderItem','FlashSaleCampaign','Payment'})
        self.assertFalse(any("-'" in q for q in calls))

    def test_migration_verification_checks_schema_and_never_replays_sql(self):
        d=object.__new__(EvidenceForward)
        j={'traffic_may_have_opened':True}
        with patch.object(d,'database_state',return_value='new'),patch('update_service.native_forward.schema_hash',return_value=AFTER_SCHEMA),patch('core.dc') as dc:
            d.verify_migration(j);dc.assert_not_called()
        with patch.object(d,'database_state',return_value='new'),patch('update_service.native_forward.schema_hash',return_value='f'*64):
            with self.assertRaises(Rejected):d.verify_migration(j)

    def test_payment_activation_is_rejected(self):
        d=object.__new__(EvidenceForward)
        with patch.object(NativeForward,'verify_active'),patch('core.sql',return_value='1'):
            with self.assertRaisesRegex(Rejected,'unexpected_payment_activation'):d.verify_active({})

    def test_signed_policy_binds_artifact_installation_and_revocation(self):
        from update_service.policy_feed import authorized
        from update_service.state import State
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)
            subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(p/'key')],check=True,capture_output=True)
            public=subprocess.check_output(['openssl','pkey','-in',str(p/'key'),'-pubout']).decode()
            (p/'roots').write_text(json.dumps({'fixture':public}))
            policy={**self.policy, 'repository':'Assyauq26/buattokoonline', 'id':'evidence-fixture',
                    'sequence':1,'issuedAt':1000,'expiresAt':2000,'sourceSha':'a'*40,
                    'artifactDigest':'b'*64,'minimumWorker':3,
                    'failureStrategy':'forward-only-after-migration','installations':['a'*32]}
            raw=json.dumps(policy).encode();(p/'payload').write_bytes(raw)
            subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(p/'key'),'-rawin','-in',str(p/'payload'),'-out',str(p/'sig')],check=True,capture_output=True)
            envelope={'keyId':'fixture','payload':base64.b64encode(raw).decode(),'signature':base64.b64encode((p/'sig').read_bytes()).decode()}
            release={'sha':'a'*40,'digest':'b'*64,'version':'1.8.2','size':100,'url':'fixture',
                     'minimumUpdater':3,'rollbackCompatible':False,'dbContract':1,'channel':'stable',
                     'minimumInstalledVersion':'1.8.1','maximumInstalledVersion':'1.8.1','upgradePolicy':envelope}
            installed={'version':'1.8.1','source_sha':BASE_SOURCE,'migrations':self.policy['beforeMigrations']}
            config={'installation':'a'*32,'trust':str(p/'roots'),'channel':'stable'}
            catalog={'expiresAt':2000,'releases':[release],'revoked':[]}
            state=State(p/'state','fixture')
            with patch('update_service.policy_feed.time.time',return_value=1500):
                self.assertEqual(authorized(release,installed,config,state,catalog)['executor'],EXECUTOR)
                for bad_config,bad_release,bad_catalog in [
                    ({**config,'installation':'b'*32},release,catalog),
                    (config,{**release,'digest':'f'*64},catalog),
                    (config,release,{**catalog,'revoked':[release['sha']]}),
                    (config,release,{**catalog,'expiresAt':1500}),
                ]:
                    with self.assertRaises(Rejected):authorized(bad_release,installed,bad_config,state,bad_catalog)
                tampered=copy.deepcopy(envelope);tampered['payload']=base64.b64encode(b'{}').decode()
                bad={**release,'upgradePolicy':tampered}
                with self.assertRaises(Rejected):authorized(bad,installed,config,state,{**catalog,'releases':[bad]})


if __name__=='__main__':unittest.main()
