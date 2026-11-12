"""Release contract checks only; never contacts or changes a store."""
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
import core
import updater
import historical_migrations


class PromotionReleaseTests(unittest.TestCase):
    def test_version_and_conservative_upgrade_policy(self):
        self.assertEqual((ROOT / 'VERSION').read_text().strip(), '1.8.0')
        policy = json.loads((ROOT / 'release-policy.json').read_text())
        self.assertEqual(policy, {
            'db_contract': 1, 'minimum_installed_contract': 1,
            'maximum_installed_contract': 1, 'postgres_major': 16,
            'rollback_compatible': False,
            'minimum_installed_version': '1.7.4',
            'maximum_installed_version': '1.7.4',
        })
        # package.json is a private dependency/workspace version, not VERSION.
        self.assertEqual(json.loads((ROOT / 'app/package.json').read_text())['version'], '1.0.0')

    def test_migration_is_atomic_bounded_and_does_not_rewrite_existing_rows(self):
        sql = (ROOT / 'app/prisma/migrations/20261112050000_promotion_sku_offers/migration.sql').read_text()
        self.assertIn("BEGIN;\nSET LOCAL lock_timeout = '3s';", sql)
        self.assertIn("SET LOCAL statement_timeout = '30s';", sql)
        self.assertTrue(sql.rstrip().endswith('COMMIT;'))
        for keyword in ['UPDATE ', 'DELETE ', 'INSERT ', 'TRUNCATE ', 'DROP ']:
            self.assertNotIn(keyword, sql.replace('ON DELETE CASCADE', '').replace('ON DELETE RESTRICT', ''))
        self.assertIn('ADD COLUMN "draft" JSONB;', sql)
        self.assertIn('ADD COLUMN "flashOfferId" UUID', sql)

    def test_automatic_migration_guard_still_rejects_operator_only_sql(self):
        sql = (ROOT / 'app/prisma/migrations/20261112050000_promotion_sku_offers/migration.sql').read_text()
        with self.assertRaises(core.StoreError):
            updater.validate_additive(sql)

    def test_existing_historical_exceptions_do_not_authorize_v180(self):
        name = '20261109120000_order_resolution_workflow'
        old = (ROOT / 'tests/fixtures/historical-eol' / (name + '.bin')).read_bytes()
        fresh = (ROOT / 'app/prisma/migrations' / name / 'migration.sql').read_bytes()
        self.assertEqual(hashlib.sha256(old).hexdigest(), historical_migrations.PAIRS[name][0])
        with self.assertRaises(core.StoreError):
            historical_migrations.authorize(
                name, old, fresh,
                {'version': '1.7.3', 'source_sha': 'c67fb49da284d51618524812d83974de70526657',
                 'db_contract': 1, 'migrations': {name: historical_migrations.PAIRS[name][0]}},
                {'installation': historical_migrations.INSTALLATION, 'origin': 'https://hubify.web.id'},
                ROOT / 'tests/fixtures/historical-eol/store-v1.7.2.tar.gz',
                target_version='1.8.0',
            )

    def test_historical_migrations_match_authenticated_v174_inventory(self):
        # A pinned public manifest permits the same check in shallow CI clones.
        baseline = json.loads((ROOT / 'tests/fixtures/promotions-v174-inventory.json').read_text())
        self.assertEqual(baseline['artifact_sha256'], '0a286296c0c85e5e320f85043e85dede0213e013dae129351a374df35f586b4e')
        self.assertEqual(len(baseline['migrations']), 29)
        for name, expected in baseline['migrations'].items():
            data = (ROOT / 'app/prisma/migrations' / name / 'migration.sql').read_bytes()
            self.assertEqual(hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest(), expected, name)


if __name__ == '__main__':
    unittest.main()
