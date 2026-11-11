import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

MODULE_PATH = Path(__file__).resolve().parents[1] / 'staging/hubify-staging-deploy.py'
spec = importlib.util.spec_from_file_location('hubify_staging_deploy', MODULE_PATH)
hubify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hubify)


class StagingSafetyTests(unittest.TestCase):
    def test_preserves_live_integrations_and_changes_only_release_builds(self):
        live = {'services': {
            'app': {'image': 'old', 'build': {'context': '/old'},
                    'environment': {'STORE_INSTALLED_VERSION': '1.7.2', 'STORE_WHATSAPP_ENABLED': '1', 'STORE_UPDATER_ENABLED': '1'},
                    'volumes': ['/media:/media', '/run/updater:/run/updater:ro', '/private/token:/run/token:ro'],
                    'env_file': ['/etc/runtime.env'], 'mem_limit': '768m'},
            'tools': {'image': 'old-tools', 'env_file': ['/etc/migration.env']},
            'db': {'image': 'postgres:16', 'volumes': ['/data:/var/lib/postgresql/data']}}}
        with patch.object(hubify.core, 'read_json', return_value=live):
            result = hubify.deployment_compose(Path('/reviewed'), 'a'*40, '1.7.3')
        self.assertEqual(result['services']['db'], live['services']['db'])
        for key in ('volumes', 'env_file', 'mem_limit'):
            self.assertEqual(result['services']['app'][key], live['services']['app'][key])
        self.assertEqual(result['services']['app']['environment']['STORE_WHATSAPP_ENABLED'], '1')
        self.assertEqual(result['services']['app']['environment']['STORE_UPDATER_ENABLED'], '1')
        self.assertEqual(result['services']['app']['environment']['STORE_INSTALLED_VERSION'], '1.7.3')
        self.assertEqual(result['services']['app']['environment']['STORE_BUILD_SHA'], 'a'*40)
        self.assertEqual(result['services']['app']['build'], {'context': '/reviewed/app', 'target': 'runtime'})
        self.assertEqual(live['services']['app']['image'], 'old')
        self.assertEqual(live['services']['app']['environment']['STORE_INSTALLED_VERSION'], '1.7.2')

    def test_refuses_unknown_live_environment_format_before_downtime(self):
        with patch.object(hubify.core, 'read_json', return_value={'services': {'app': {'environment': ['A=B']}, 'tools': {}}}):
            with self.assertRaises(hubify.core.StoreError):
                hubify.deployment_compose(Path('/reviewed'), 'a'*40, '1.7.3')

    def test_rejects_legacy_or_invalid_arguments(self):
        for args in (['3', 'a'*40], ['invalid'], ['A'*40], [], ['--rollback', 'extra']):
            with patch.object(sys, 'argv', ['hubify-staging-deploy', *args]), \
                 patch.object(hubify.os, 'umask'), self.assertRaises(hubify.core.StoreError):
                hubify.main()

    def test_verifies_repository_identity_without_pr_or_ci(self):
        repo = {'id': hubify.core.REPO_ID, 'full_name': hubify.REPOSITORY}
        with patch.object(hubify, 'github', return_value=repo) as github:
            hubify.verify_repository()
            github.assert_called_once_with('')
        with patch.object(hubify, 'github', return_value={**repo, 'id': 0}):
            with self.assertRaises(hubify.core.StoreError):
                hubify.verify_repository()

    def test_deploy_source_is_exact_main_head(self):
        sha = 'a'*40
        with tempfile.TemporaryDirectory() as directory, patch.object(hubify.core, 'ROOT', Path(directory)):
            with patch.object(hubify.core, 'run', side_effect=['', '', '', sha, '']) as run:
                source = hubify.prepare_source(sha)
                run.assert_any_call(['git', '-C', source, 'fetch', '--depth=1', 'origin', 'refs/heads/main'], timeout=180)
                run.assert_called_with(['git', '-C', source, 'checkout', '-q', '--detach', sha])
            with patch.object(hubify.core, 'run', side_effect=['', '', '', 'b'*40]) as run:
                with self.assertRaisesRegex(hubify.core.StoreError, 'HEAD main'):
                    hubify.prepare_source(sha)
                self.assertEqual(run.call_count, 4)

    def test_refuses_other_domains_and_jnt_production(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory)
            (config / 'installed').touch()
            (config / 'runtime.env').write_text('APP_ORIGIN=https://hubify.web.id\n')
            (config / 'setup.json').write_text(json.dumps({
                'domain': 'hubify.web.id', 'complete': True, 'local_test': False}))
            (config / 'version.json').write_text(json.dumps({'version': '1.0.0'}))
            with patch.object(hubify.os, 'geteuid', return_value=0, create=True), \
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


    def test_reviewed_shipping_migration_requires_exact_checksum(self):
        repository = MODULE_PATH.parents[1]
        name = '20261105100000_shipping_settings'
        migrations = Path('app/prisma/migrations')
        installed = {'version': '1.0.0', 'db_contract': 1, 'migrations': {}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'VERSION').write_text('1.0.0')
            # This fixture exercises the historic reviewed shipping migration,
            # independently of the current release's financial rollback policy.
            (path / 'release-policy.json').write_text(json.dumps({
                'db_contract': 1, 'postgres_major': 16, 'rollback_compatible': True}))
            source = migrations / name / 'migration.sql'
            target = path / source
            target.parent.mkdir(parents=True)
            original = (repository / source).read_bytes()
            target.write_bytes(original)
            self.assertEqual(hubify.check_schema(path, installed)[0], hubify.REVIEWED_MIGRATIONS)
            target.write_bytes(original + b'\n-- changed')
            with self.assertRaisesRegex(hubify.core.StoreError, 'Checksum migrasi Hubify'):
                hubify.check_schema(path, installed)

    def test_rollback_records_migrations_that_remain_in_database(self):
        installed = {'source_sha': 'old', 'migrations': {'old': '1'}}
        journal = {'from': installed}
        actual = {'old': '1', 'new': '2'}
        with patch.object(hubify.updater, 'recover') as recover, \
             patch.object(hubify, 'read_db_inventory', return_value=actual), \
             patch.object(hubify.core, 'atomic_json') as write:
            hubify.recover_code(journal, actual)
            recover.assert_called_once_with(journal)
            write.assert_called_once_with(hubify.core.CONFIG / 'version.json', {**installed, 'migrations': actual})
            with self.assertRaises(hubify.core.StoreError):
                hubify.recover_code(journal, {'old': '1', 'new': 'unexpected'})
            self.assertEqual(write.call_count, 1)


if __name__ == '__main__':
    unittest.main()
