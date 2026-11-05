import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / 'staging/hubify-staging-deploy.py'
spec = importlib.util.spec_from_file_location('hubify_staging_deploy', MODULE_PATH)
hubify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hubify)


class StagingSafetyTests(unittest.TestCase):
    def test_rejects_incorrect_sha_or_pr(self):
        for pr, sha in [('0', 'a'*40), ('1', 'invalid'), ('../2', 'a'*40), ('1', 'A'*40)]:
            with self.assertRaises(hubify.core.StoreError):
                hubify.verify_candidate(pr, sha)

    def test_pr_ownership_exact_sha_and_ci_required(self):
        sha = 'a'*40
        pr = {
            'state': 'open',
            'head': {'sha': sha, 'repo': {'full_name': hubify.REPOSITORY}, 'ref': 'feat/test'},
            'base': {'repo': {'full_name': hubify.REPOSITORY}, 'ref': 'main'}}
        runs = {'workflow_runs': [{
            'head_sha': sha, 'head_branch': 'feat/test', 'conclusion': 'success'}]}
        with patch.object(hubify, 'github', side_effect=[
            {'id': hubify.core.REPO_ID, 'full_name': hubify.REPOSITORY}, pr, runs]):
            self.assertEqual(hubify.verify_candidate('3', sha), pr)
        with patch.object(hubify, 'github', side_effect=[
            {'id': hubify.core.REPO_ID, 'full_name': hubify.REPOSITORY},
            {**pr, 'head': {**pr['head'], 'sha': 'b'*40}}, runs]):
            with self.assertRaises(hubify.core.StoreError):
                hubify.verify_candidate('3', sha)
        with patch.object(hubify, 'github', side_effect=[
            {'id': hubify.core.REPO_ID, 'full_name': hubify.REPOSITORY}, pr,
            {'workflow_runs': [{**runs['workflow_runs'][0], 'conclusion': 'failure'}]}]):
            with self.assertRaises(hubify.core.StoreError):
                hubify.verify_candidate('3', sha)

    def test_refuses_other_domains_and_jnt_production(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory)
            (config / 'installed').touch()
            (config / 'runtime.env').write_text('APP_ORIGIN=https://hubify.web.id\n')
            (config / 'setup.json').write_text(json.dumps({
                'domain': 'hubify.web.id', 'complete': True, 'local_test': False}))
            (config / 'version.json').write_text(json.dumps({'version': '1.0.0'}))
            with patch.object(hubify.os, 'geteuid', return_value=0), \
                 patch.object(hubify.core, 'CONFIG', config), \
                 patch.object(hubify.core, 'STATE', config / 'setup.json'), \
                 patch.object(hubify, 'JOURNAL', config / 'update.json'):
                self.assertEqual(hubify.preflight()[1]['version'], '1.0.0')
                (config / 'runtime.env').write_text(
                    'APP_ORIGIN=https://hubify.web.id\nJNT_PRODUCTION_ORDER_APPROVED=yes\n')
                with self.assertRaises(hubify.core.StoreError):
                    hubify.preflight()
                (config / 'runtime.env').write_text('APP_ORIGIN=https://hubify.web.id\n')
                (config / 'setup.json').write_text(json.dumps({
                    'domain': 'gheverhan.store', 'complete': True, 'local_test': False}))
                with self.assertRaises(hubify.core.StoreError):
                    hubify.preflight()

    def test_destructive_database_migration_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            migration = path / 'app/prisma/migrations/20261105150000_test/migration.sql'
            migration.parent.mkdir(parents=True)
            migration.write_text('DROP TABLE "User";')
            (path / 'VERSION').write_text('1.0.1')
            (path / 'release-policy.json').write_text(json.dumps({
                'db_contract': 1, 'postgres_major': 16, 'rollback_compatible': True}))
            with self.assertRaises(hubify.core.StoreError):
                hubify.check_schema(path, {
                    'version': '1.0.0', 'db_contract': 1, 'migrations': {}})


if __name__ == '__main__':
    unittest.main()
