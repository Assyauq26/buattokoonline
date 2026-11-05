import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'installer'))
import core
import progress


class ProgressTests(unittest.TestCase):
    def test_checkpoint_is_not_done_while_operation_runs_and_survives_restart(self):
        saved = []
        state = {'password': 'never-project-this', 'setup_hash': 'private'}
        tracker = progress.Tracker(state, lambda: saved.append(copy.deepcopy(state)))
        tracker.begin()
        with tracker.phase('verify'):
            self.assertEqual(progress.public(state['progress'])['completed'], 0)
        with tracker.phase('build'):
            snapshot = progress.public(state['progress'])
            self.assertEqual(snapshot['completed'], 1)
            self.assertEqual(snapshot['phases'][2]['status'], 'running')
            restarted = copy.deepcopy(saved[-1])
            progress.interrupt(restarted)
            self.assertEqual(progress.public(restarted['progress'])['phases'][2]['status'], 'failed')
            self.assertIn('terputus', restarted['message'])
        state['progress']['password'] = 'injected-secret'
        state['progress']['phases'][0]['token'] = 'injected-token'
        self.assertNotIn('secret', json.dumps(progress.public(state['progress'])))
        self.assertNotIn('token', json.dumps(progress.public(state['progress'])))
        self.assertNotIn('password', json.dumps(progress.public(state['progress'])))

    def test_failure_is_durable_and_resume_preserves_completed_checkpoints(self):
        state = {}
        tracker = progress.Tracker(state, lambda: None)
        tracker.begin()
        with tracker.phase('verify'):
            pass
        with self.assertRaises(RuntimeError), tracker.phase('build'):
            raise RuntimeError('secret must not be persisted')
        self.assertEqual(progress.public(state['progress'])['completed'], 1)
        self.assertEqual(progress.public(state['progress'])['phases'][2]['status'], 'failed')
        self.assertNotIn('secret', json.dumps(state))
        tracker.begin()
        self.assertEqual(progress.public(state['progress'])['completed'], 1)
        for key, _ in progress.PHASES:
            with tracker.phase(key):
                pass
        self.assertEqual(progress.public(state['progress'])['completed'], 9)

    def test_health_failure_blocks_completion_and_records_actual_execution_order(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory)
            state = {'domain': 'localhost', 'name': 'Toko Mawar', 'built': False, 'bootstrap_started': True, 'local_test': True, 'admin_email': 'admin@example.test'}
            tracker = progress.Tracker(state, lambda: None)
            tracker.begin()
            with tracker.phase('verify'):
                pass
            calls = []
            def active():
                return next(p['id'] for p in state['progress']['phases'] if p['status'] == 'running')
            def command(args, *unused, **kwargs):
                calls.append((active(), args))
                return ''
            with patch.object(core, 'CONFIG', config), patch.object(core, 'STATE', config/'setup.json'), patch.object(core, 'create_secrets'), patch.object(core, 'run', side_effect=command), patch.object(core, 'dc', side_effect=command), patch.object(core, 'sql', return_value='{"users":0,"identity":0}'), patch.object(core, 'grant_runtime'), patch.object(core, 'write_caddy'), patch.object(core, 'healthy', side_effect=core.StoreError('Not healthy')):
                with self.assertRaises(core.StoreError):
                    core.initialize_store(state, 'Aa9!password-test-only', tracker)
            self.assertNotIn('complete', state)
            projected = progress.public(state['progress'])
            self.assertEqual(projected['phases'][7]['status'], 'failed')
            self.assertEqual(projected['phases'][8]['status'], 'pending')
            self.assertEqual([phase for phase, _ in calls], ['prepare', 'prepare', 'build', 'database', 'migrations', 'administrator', 'activate'])
            self.assertTrue(state['built'])
            self.assertTrue(state['has_admin'])
            self.assertNotIn('password-test-only', json.dumps(state))


if __name__ == '__main__':
    unittest.main()
