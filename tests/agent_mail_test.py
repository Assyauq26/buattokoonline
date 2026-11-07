"""No network, Docker or production files: exercise agent secret delivery."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


@unittest.skipIf(os.name == 'nt', 'Agent targets Ubuntu/fcntl')
class AgentMailTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('mail_agent', Path(__file__).parents[1] / 'installer/agent.py')
        self.agent = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.agent)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.runtime = Path(self.directory.name) / 'runtime.env'
        self.runtime.write_text('APP_ORIGIN=https://shop.example.test\nJWT_SECRET=synthetic-preserved\n')
        self.store = {'domain': 'shop.example.test', 'mailRequired': True}
        self.token = 'a' * 64
        self.api = Mock(return_value={'token': self.token, 'generation': 1, 'origin': 'https://shop.example.test'})
        self.core = SimpleNamespace(sql=Mock(return_value='Test Shop'), dc=Mock(), healthy=Mock())
        response = Mock(status=200)
        response.read.return_value = json.dumps({'receipt': {'expires': 123, 'signature': 'synthetic'}}).encode()
        context = Mock()
        context.__enter__ = Mock(return_value=response)
        context.__exit__ = Mock(return_value=False)
        self.opener = Mock()
        self.opener.open.return_value = context
        for target, replacement in [('api', self.api), ('Path', Mock(return_value=self.runtime))]:
            p = patch.object(self.agent, target, replacement); p.start(); self.addCleanup(p.stop)
        p = patch.object(self.agent.urllib.request, 'build_opener', return_value=self.opener)
        p.start(); self.addCleanup(p.stop)

    def test_retry_preserves_secret_and_reconciles_container(self):
        for _ in range(2):
            self.agent.sync_mail({}, self.store, self.core)
        data = self.runtime.read_text()
        self.assertEqual(data.count('STORE_MAIL_RELAY_TOKEN='), 1)
        self.assertIn('JWT_SECRET=synthetic-preserved', data)
        self.assertEqual(self.runtime.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.core.dc.call_count, 2)
        self.assertEqual(self.api.call_args.args[1], 'mail-ack')

    def test_wrong_origin_never_writes_token(self):
        with self.assertRaisesRegex(RuntimeError, 'MAIL_IDENTITY_MISMATCH'):
            self.agent.sync_mail({}, {**self.store, 'domain': 'other.example.test'}, self.core)
        self.assertNotIn(self.token, self.runtime.read_text())
        self.core.dc.assert_not_called()

    def test_failed_recreation_never_acknowledges_readiness(self):
        self.core.dc.side_effect = RuntimeError('synthetic failure')
        with self.assertRaises(RuntimeError):
            self.agent.sync_mail({}, self.store, self.core)
        self.assertEqual(self.api.call_count, 1)

    def test_disabled_controller_keeps_legacy_installation_compatible(self):
        self.agent.sync_mail({}, {'domain': self.store['domain']}, self.core)
        self.api.assert_not_called()
        self.core.dc.assert_not_called()


if __name__ == '__main__':
    unittest.main()
