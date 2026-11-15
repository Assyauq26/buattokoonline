import copy
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
if os.name!='posix':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
import core
import blu_checkout_cutover as blu
from blu_oauth import validate
from update_service.trust import Rejected

class HubifyBluCutoverTests(unittest.TestCase):
    def test_prepared_receipt_names_actual_build_without_legacy_image_identity(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            d=object.__new__(blu.Native);d.folder=Path(folder)/'new';d.repository=Path(folder);d.sha='a'*40;d.digest='b'*64
            d.files={'app/source':b'fixture'};d.manifest={'source_sha':d.sha}
            d.prepared_images={'sourceSha':d.sha,'artifactDigest':d.digest,'app':'sha256:'+'c'*64,'tools':'sha256:'+'d'*64,'builder':'official-prebuild'}
            j={'old_compose':{'services':{'app':{'environment':{'JNT_PRODUCTION_API_APPROVED':'yes'}},'tools':{}}}}
            with patch('core.run',side_effect=lambda args: 'e'*40 if args[0]=='git' else d.prepared_images['app']),patch('core.read_json',return_value={'channel':'pilot'}),patch('update_service.engine.Engine.build') as build:
                d.prepare(j);build.assert_not_called()
            self.assertEqual(j['reused_build'],{**d.prepared_images,'operatorReviewed':True})
            self.assertEqual(j['candidate']['services']['app']['environment']['STORE_BUILD_SHA'],d.sha)
            self.assertEqual(j['candidate']['services']['app']['environment']['JNT_PRODUCTION_API_APPROVED'],'yes')
            self.assertEqual(j['candidate']['services']['app']['environment']['STORE_INSTALLED_VERSION'],'1.8.2')
            self.assertEqual(j['candidate']['services']['tools']['image'],d.prepared_images['tools'])
    def test_only_the_one_new_migration_and_byte_identical_history(self):
        old={'migrations':{str(n):'a'*64 for n in range(32)}}
        files={'app/prisma/migrations/'+n+'/migration.sql':b'old SQL' for n in old['migrations']}
        files['app/prisma/migrations/migration_lock.toml']=b'provider'
        policy=json.loads((Path(__file__).resolve().parents[1]/'release-policy.json').read_text())
        new={'migrations':{**old['migrations'],blu.ACTIVATION_NAME:blu.ACTIVATION_SQL},'compatibility':policy}
        blu.review_schema(old,new,files,files)
        for name in files:
            other={**files,name:files[name]+b'\r\n'}
            with self.subTest(name=name),self.assertRaises(core.StoreError):blu.review_schema(old,new,files,other)
        with self.assertRaises(core.StoreError):blu.review_schema(old,{**new,'migrations':old['migrations']},files,files)
        with self.assertRaises(core.StoreError):blu.review_schema(old,{**new,'compatibility':{**policy,'rollback_compatible':True}},files,files)
    def test_sixth_guard_is_only_additive(self):
        self.assertEqual(blu.Native.next_guard.replace(b",'hubify-blu-checkout-cutover.json'",b''),blu.Native.previous_guard)
        self.assertNotEqual(blu.Native.journal_name,blu.Native.previous_receipt)
        self.assertEqual(blu.Native.base_sha,'8e65f4a74eb7b597afa27e87f28e3a5d141da1c2')
    def test_no_migration_without_backup_and_no_app_rollback_after_intent(self):
        d=object.__new__(blu.Native)
        with patch('core.dc') as dc:
            with self.assertRaises(core.StoreError):d.migrate({})
            with self.assertRaises(core.StoreError):d.rollback_before_migration({'migration_started':True})
            dc.assert_not_called()
    def test_intermediate_or_bad_ledger_is_uncertain(self):
        d=object.__new__(blu.Native);old={'old':'a'};j={'from':{'migrations':old}}
        rows=[dict(migration_name='old',checksum='a',finished_at='time',rolled_back_at=None)]
        with patch.object(d,'ledger_rows',return_value=rows):self.assertEqual(d.database_state(j),'old')
        after=[*rows,dict(migration_name=blu.ACTIVATION_NAME,checksum=blu.ACTIVATION_SQL,finished_at='time',rolled_back_at=None)]
        with patch.object(d,'ledger_rows',return_value=after):self.assertEqual(d.database_state(j),'new')
        for bad in ([*rows,*rows],[{**rows[0],'checksum':'bad'}],[{**rows[0],'finished_at':None}]):
            with patch.object(d,'ledger_rows',return_value=bad):self.assertEqual(d.database_state(j),'uncertain')
    def test_oauth_requires_exact_own_domain_callback(self):
        origin='https://shop.example.invalid'
        web={'client_id':'test-client.apps.googleusercontent.com','client_secret':'synthetic-secret-only',
            'auth_uri':'https://accounts.google.com/o/oauth2/auth','token_uri':'https://oauth2.googleapis.com/token',
            'redirect_uris':[origin+'/api/v1/admin/payment-evidence/oauth/callback']}
        self.assertEqual(validate({'web':web},origin)[1],web['redirect_uris'][0])
        for value in ({**web,'redirect_uris':['https://hubify.web.id/api/v1/admin/payment-evidence/oauth/callback']},
                      {**web,'token_uri':'https://untrusted.invalid/token'},{**web,'client_secret':'bad\nENV=1'}):
            with self.assertRaises(Rejected):validate({'web':value},origin)
        with self.assertRaises(Rejected):validate({'web':web},'http://shop.example.invalid')

if __name__=='__main__':unittest.main()
