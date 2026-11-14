import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'installer'))
import core
import payment_test_cutover as pilot

class TestCutover(unittest.TestCase):
    def test_same_schema_requires_all_historical_bytes(self):
        migrations={str(n):str(n) for n in range(32)}
        manifest={'migrations':migrations}
        files={'app/prisma/schema.prisma':b'schema','app/prisma/migrations/migration_lock.toml':b'lock'}
        files.update({'app/prisma/migrations/'+n+'/migration.sql':b'SQL' for n in migrations})
        pilot.same_schema(manifest,manifest,files,files)
        for path in files:
            wrong=copy.deepcopy(files);wrong[path]+=b'\r\n'
            with self.assertRaises(core.StoreError):pilot.same_schema(manifest,manifest,files,wrong)
        with self.assertRaises(core.StoreError):pilot.same_schema(manifest,{'migrations':{}},files,files)

    def test_reconcile_never_mistakes_same_schema_for_prepared_app(self):
        driver=object.__new__(pilot.Native)
        with patch.object(driver,'ledger_valid',return_value=True):
            self.assertEqual(driver.database_state({}),'old')
            self.assertEqual(driver.database_state({'phase':'build','migration_started':False}),'old')
            self.assertEqual(driver.database_state({'migration_started':True}),'new')
        with patch.object(driver,'ledger_valid',return_value=False):
            self.assertEqual(driver.database_state({'migration_started':True}),'uncertain')

    def test_activation_without_verified_backup_refused(self):
        driver=object.__new__(pilot.Native)
        with patch.object(pilot.core,'dc') as dc:
            with self.assertRaises(core.StoreError):driver.activate({})
            dc.assert_not_called()

    def test_noop_migration_only_verifies(self):
        driver=object.__new__(pilot.Native)
        with patch.object(driver,'verify_migration') as verify, patch.object(pilot.core,'dc') as dc:
            driver.migrate({'backup_verified':True})
            verify.assert_called_once();dc.assert_not_called()

    def test_guard_only_adds_a_restrictive_journal(self):
        self.assertEqual(pilot.GUARD.count(b'operator_cutover_in_progress'),1)
        self.assertEqual(pilot.NEXT_GUARD.replace(b",'hubify-payment-test-cutover.json'",b''),pilot.GUARD)

    def test_auth_continuation_preserves_original_edge_and_adds_only_its_own_guard(self):
        self.assertEqual(pilot.Native.base_sha,pilot.BASE_SHA)
        self.assertEqual(pilot.Native.journal_name,'hubify-payment-test-cutover.json')
        self.assertEqual(pilot.AuthNative.base_sha,'e6cc5eb72cf9d737bfce59ed7a514bdea48ad0ac')
        self.assertEqual(pilot.AuthNative.previous_guard,pilot.NEXT_GUARD)
        self.assertEqual(pilot.AuthNative.next_guard.replace(b",'hubify-blu-auth-cutover.json'",b''),pilot.NEXT_GUARD)
        self.assertNotEqual(pilot.AuthNative.journal_name,pilot.AuthNative.previous_receipt)

    def test_prepared_requires_exact_receipt_and_identical_app_bytes(self):
        manifest={'source_sha':pilot.PREPARED_SHA,'version':'1.8.1','migrations':{'old':'same'},'files':{'app/source':'hash','installer/code':'old'}}
        candidate={**manifest,'source_sha':'b'*40,'files':{'app/source':'hash','installer/code':'new'}}
        receipt={'phase':'rolled_back','sha':pilot.PREPARED_SHA,'digest':pilot.PREPARED_DIGEST,'image':pilot.PREPARED_IMAGE,
            'manifest':manifest,'candidate':{'services':{}},'fence_started':False,'migration_started':False}
        self.assertEqual(pilot.review_prepared(receipt,manifest,candidate),pilot.PREPARED_IMAGE)
        for patch in [{'phase':'recovery_required'},{'sha':'wrong'},{'digest':'wrong'},{'image':'wrong'},{'fence_started':True},{'migration_started':True},{'traffic_may_have_opened':True}]:
            with self.assertRaises(core.StoreError):pilot.review_prepared({**receipt,**patch},manifest,candidate)
        for patch in [{'files':{'app/source':'changed'}},{'version':'1.8.2'},{'migrations':{}}]:
            with self.assertRaises(core.StoreError):pilot.review_prepared(receipt,manifest,{**candidate,**patch})

    def test_prepared_uses_distinct_receipt_and_retains_all_operator_guards(self):
        self.assertNotEqual(pilot.PreparedAuthNative.journal_name,pilot.AuthNative.journal_name)
        self.assertEqual(pilot.PreparedAuthNative.next_guard.replace(b",'hubify-blu-auth-retry-cutover.json'",b''),pilot.AuthNative.next_guard)
        self.assertIsNone(object.__new__(pilot.Native).prepared_image())

if __name__=='__main__':unittest.main()
