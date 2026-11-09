"""Failure-path checks for the operator upgrade, with all infrastructure mocked."""
import importlib.util
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch


class UpgradeTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.root.name)
        self.core = types.ModuleType('core')
        self.core.CONFIG = self.path
        self.core.COMPOSE = self.path / 'compose.json'
        self.core.dc = Mock()
        self.core.run = Mock()
        self.core.sql = Mock(return_value='{"new_migration":"digest"}')
        self.core.atomic_json = Mock()
        self.core.healthy = Mock()
        self.updater = types.ModuleType('updater')
        spec = importlib.util.spec_from_file_location('hubify_v130_tested', pathlib.Path(__file__).with_name('hubify-v130.py'))
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'core': self.core, 'updater': self.updater}):
            spec.loader.exec_module(self.module)

    def tearDown(self):
        self.root.cleanup()

    def test_rollback_restores_code_but_retains_actual_schema_inventory(self):
        journal = {'old_compose': {'old': True}, 'previous': {'version': '1.2.1', 'migrations': {}}}
        self.module.rollback(journal)
        args = self.core.dc.call_args.args[0]
        self.assertIn('--no-build', args)
        self.assertNotIn('down', args)
        version = self.core.atomic_json.call_args_list[1].args[1]
        self.assertEqual(version['version'], '1.2.1')
        self.assertEqual(version['migrations'], {'new_migration': 'digest'})
        self.assertEqual(journal['status'], 'code-rolled-back')

    def test_failed_scratch_restore_drops_only_generated_scratch_database(self):
        (self.path / 'database.dump').write_bytes(b'test')
        with patch.object(self.module.subprocess, 'run', return_value=types.SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(RuntimeError, 'Scratch restore failed'):
                self.module.rehearse(str(self.path), self.path)
        calls = self.core.dc.call_args_list
        created = calls[0].args[0][-1]
        dropped = calls[-1].args[0][-1]
        self.assertEqual(created, dropped)
        self.assertRegex(dropped, r'^v130_rehearsal_[a-f0-9]{16}$')
        self.assertNotEqual(dropped, 'store')

    def test_non_hubify_target_rejected_before_any_docker_operation(self):
        (self.path / 'runtime.env').write_text('APP_ORIGIN=https://other.example\n')
        with patch.object(self.module.os, 'geteuid', return_value=0):
            with self.assertRaisesRegex(RuntimeError, 'Not Hubify'):
                self.module.main()
        self.core.dc.assert_not_called()
        self.core.run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
