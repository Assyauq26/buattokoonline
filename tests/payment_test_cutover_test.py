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

if __name__=='__main__':unittest.main()
