"""Cookie/session parity and reversible UI routing; no production access."""
import base64
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
if os.name!='posix':
    sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
    import socketserver
    socketserver.UnixStreamServer=socketserver.TCPServer
from update_service.cookie_session import actor
from update_service.server import Controller,Handler,StatusServer
from update_service import ui_route
from update_service.trust import Rejected
from update_service.status_page import page,SCRIPT


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.p=Path(self.temp.name)
        (self.p/'runtime.env').write_text('JWT_SECRET='+'s'*32+'\nAPP_ORIGIN=https://shop.example\n')
        p=patch('core.CONFIG',self.p);p.start();self.addCleanup(p.stop)
        self.controller=types.SimpleNamespace(config={'origin':'https://shop.example'})
        self.controller.actor=types.MethodType(Controller.actor,self.controller)
        self.sql=patch('core.sql',return_value='1').start();self.addCleanup(patch.stopall)
        self.claims={'sub':'admin1','email':'admin@example.invalid','ver':0,'iat':int(time.time()),'exp':int(time.time())+600,'jti':'test-jti','iss':'https://shop.example','aud':'storefront'}
    def token(self,claims=None,header=None):
        enc=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).rstrip(b'=').decode()
        raw=enc(header or {'alg':'HS256'})+'.'+enc(claims or self.claims)
        return raw+'.'+base64.urlsafe_b64encode(hmac.new(b's'*32,raw.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
    def test_matches_app_jti_revocation_hash(self):
        self.assertEqual(actor('store_session='+self.token(),self.controller),'admin1')
        self.assertIn(hashlib.sha256(b'test-jti').hexdigest(),self.sql.call_args.args[0])
    def test_legacy_without_jti_matches_app_token_hash(self):
        claims={k:v for k,v in self.claims.items() if k!='jti'};token=self.token(claims)
        actor('store_session='+token,self.controller)
        self.assertIn(hashlib.sha256(token.encode()).hexdigest(),self.sql.call_args.args[0])
    def test_invalid_claims_signature_and_algorithm_fail_closed(self):
        for claims in ({**self.claims,'exp':0},{**self.claims,'aud':'other'},{**self.claims,'iss':'https://other'},
                       {**self.claims,'ver':True},{**self.claims,'sub':"a';SELECT"}):
            with self.assertRaises(Rejected):actor('store_session='+self.token(claims),self.controller)
        with self.assertRaises(Rejected):actor('store_session='+self.token(header={'alg':'none'}),self.controller)
        with self.assertRaises(Rejected):actor('store_session='+self.token()[:-8]+'invalid!',self.controller)
    def test_role_revocation_and_version_are_rechecked(self):
        self.sql.return_value='0'
        with self.assertRaises(Rejected):actor('store_session='+self.token(),self.controller)
    def test_http_page_and_cookie_status_are_read_only(self):
        self.controller.state=types.SimpleNamespace(limit=Mock())
        self.controller.status=Mock(return_value={'installedVersion':'1.7.4','jobs':[]})
        self.controller.command=Mock()
        server=StatusServer(('127.0.0.1',0),Handler);server.controller=self.controller;server.readonly=True
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            client=http.client.HTTPConnection(*server.server_address,timeout=5)
            client.request('GET','/admin/settings/updates',headers={'Cookie':'store_session='+self.token()})
            response=client.getresponse();body=response.read().decode()
            self.assertEqual(response.status,200);self.assertIn("script-src 'nonce-",response.getheader('Content-Security-Policy'))
            self.assertIn('nonce="',body);self.assertIsNone(response.getheader('Access-Control-Allow-Origin'))
            client.request('GET','/api/local-updater/session-status',headers={'Cookie':'store_session='+self.token()})
            response=client.getresponse();self.assertEqual(response.status,200);response.read()
            client.request('POST','/command',body='{}');response=client.getresponse();self.assertEqual(response.status,404);response.read()
            self.controller.command.assert_not_called()
            client.request('GET','/admin/settings/updates');response=client.getresponse();self.assertEqual(response.status,303);response.read();client.close()
        finally:server.shutdown();server.server_close();thread.join()


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.p=Path(self.tmp.name)
        (self.p/'updater').mkdir();self.cfg={'origin':'https://shop.example','statusAddress':'172.18.0.1'}
        (self.p/'updater/config.json').write_text(json.dumps(self.cfg))
        self.old='https://shop.example {\n  handle /api/local-updater/status {\n    reverse_proxy 172.18.0.1:17841\n  }\n  handle {\n    reverse_proxy app:3000\n  }\n}\nhttps://other.example {\n respond "unchanged" 200\n}\n'
        (self.p/'Caddyfile').write_bytes(self.old.encode())
        p=patch('core.CONFIG',self.p);p.start();self.addCleanup(p.stop)
    def test_enable_finish_restore_preserve_other_sites(self):
        def write(text):(self.p/'Caddyfile').write_bytes(text.encode())
        with patch.object(ui_route,'validate_proxy'),patch.object(ui_route,'write_proxy',side_effect=write):
            backup=self.p/'backup';ui_route.enable(self.cfg,backup)
            new=(self.p/'Caddyfile').read_text();self.assertIn('https://other.example {\n respond "unchanged" 200\n}',new)
            self.assertIn('/api/local-updater/session-status',new)
            ui_route.finish(backup);ui_route.restore(backup)
            self.assertEqual((self.p/'Caddyfile').read_text(),self.old)
            self.assertEqual(json.loads((self.p/'updater/config.json').read_text()),self.cfg)
    def test_unknown_custom_change_is_never_overwritten(self):
        def write(text):(self.p/'Caddyfile').write_bytes(text.encode())
        with patch.object(ui_route,'validate_proxy'),patch.object(ui_route,'write_proxy',side_effect=write):
            backup=self.p/'backup';ui_route.enable(self.cfg,backup)
            (self.p/'Caddyfile').write_text('operator changed this')
            with self.assertRaises(Rejected):ui_route.restore(backup)
            self.assertEqual((self.p/'Caddyfile').read_text(),'operator changed this')
