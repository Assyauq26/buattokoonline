"""Enrollment recovery with temporary files and mocked network/system commands."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from urllib.error import HTTPError
from unittest import TestCase, main, skipIf
from unittest.mock import Mock, patch


@skipIf(os.name == 'nt', 'Agent targets Ubuntu/fcntl')
class EnrollmentTests(TestCase):
    def setUp(self):
        source = Path(__file__).parents[1] / 'installer/agent.py'
        spec = importlib.util.spec_from_file_location('enrollment_agent', source)
        self.agent = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.agent)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.agent.BASE = self.root / 'config'
        self.agent.WORK = self.root / 'work'
        self.token = 'a' * 64
        original_path = Path

        def local_path(value):
            if str(value) in ['/etc/single-store', '/opt/single-store', '/var/lib/single-store']:
                return self.root / 'not-installed' / str(value).split('/')[-1]
            return original_path(value)

        for name, value in [
            ('Path', local_path),
            ('installed_store', Mock(return_value=None)),
            ('run', Mock(side_effect=lambda args, **kwargs: '8.8.4.4' if args[0] == 'curl' else '')),
        ]:
            mocked = patch.object(self.agent, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)

    def enroll(self, value=None):
        with patch('sys.stdin', io.StringIO((value or self.token) + '\n')):
            self.agent.setup(token_stdin=True)

    def test_lost_response_reuses_persisted_credential_without_prompting(self):
        requests = []

        def api(config, route, data=None):
            if route == 'job':
                raise HTTPError('https://example.test', 401, 'unauthorized', {}, None)
            requests.append(dict(data))
            if len(requests) == 1:
                raise TimeoutError('synthetic network failure')
            return {'agentId': '12345678-1234-1234-1234-123456789abc', 'passwordFromWizard': True}

        with patch.object(self.agent, 'api', side_effect=api), patch.object(self.agent.getpass, 'getpass') as prompt:
            with self.assertRaises(TimeoutError):
                self.enroll()
            first = json.loads((self.agent.BASE / 'config.json').read_text())
            self.enroll()
            second = json.loads((self.agent.BASE / 'config.json').read_text())
            self.assertEqual(first['credential'], second['credential'])
            self.assertEqual(requests[0], requests[1])
            self.assertNotIn(self.token, (self.agent.BASE / 'config.json').read_text())
            self.assertEqual(second['installationId'], '12345678-1234-1234-1234-123456789abc')
            prompt.assert_not_called()

    def test_consumed_request_recovers_using_the_same_agent_identity(self):
        calls = []
        agent_id = '12345678-1234-1234-1234-123456789abc'

        def api(config, route, data=None):
            calls.append(route)
            if route == 'pair':
                raise TimeoutError('response lost after consumption')
            return {'store': {'domain': 'shop.example.test', 'vps_ipv4': '8.8.4.4'},
                    'job': {'state': 'queued', 'agent_id': agent_id}}

        with patch.object(self.agent, 'api', side_effect=api):
            with self.assertRaises(TimeoutError):
                self.enroll()
            first = json.loads((self.agent.BASE / 'config.json').read_text())
            self.enroll()
            restored = json.loads((self.agent.BASE / 'config.json').read_text())
            self.assertEqual(calls, ['pair', 'job'])
            self.assertEqual(first['credential'], restored['credential'])
            self.assertEqual(restored['installationId'], agent_id)

    def test_malformed_token_does_not_contact_controller(self):
        with patch.object(self.agent, 'api') as api:
            with self.assertRaisesRegex(RuntimeError, 'INVALID_PAIRING_TOKEN'):
                self.enroll('bad-token')
            api.assert_not_called()


if __name__ == '__main__':
    main()
