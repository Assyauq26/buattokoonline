import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'installer'))
import core
import updater


class InstallerTests(unittest.TestCase):
    def test_dns_production_states(self):
        ips = {'ipv4': '8.8.4.4', 'ipv6': None}
        def answers(a, aaaa=None):
            return [{'A': a, 'AAAA': aaaa or []}] * 2
        self.assertEqual(core.dns_status(answers([]), ips), 'Menunggu DNS diperbarui')
        self.assertEqual(core.dns_status(answers(['1.1.1.1']), ips), 'IP domain belum sesuai')
        self.assertEqual(core.dns_status(answers(['8.8.4.4'], ['2606:4700:4700::1111']), ips), 'IP domain belum sesuai')
        self.assertIsNone(core.dns_status(answers(['8.8.4.4']), ips))
        self.assertEqual(core.dns_status([{'A': ['8.8.4.4'], 'AAAA': []}, {'A': [], 'AAAA': []}], ips), 'Menunggu DNS diperbarui')

    def test_public_ip_validation_and_provider_agreement(self):
        for ip in ['127.0.0.1', '10.0.0.1', '169.254.1.1', '192.168.1.1', 'invalid']:
            self.assertIsNone(core.public_address(ip, 4))
        with patch.object(core, 'curl', side_effect=['8.8.4.4', '1.1.1.1']):
            with self.assertRaises(core.StoreError):
                core.discover_ips()

    def test_domain_and_password_boundaries(self):
        for domain in ['localhost', 'https://store.com', 'store.com/path', 'store.com\nfoo', 'store.com;id', '127.0.0.1']:
            with self.assertRaises(core.StoreError):
                core.validate_domain(domain)
        self.assertEqual(core.validate_domain('localhost', True), 'localhost')
        self.assertEqual(core.validate_domain('TOKOMAWAR.COM'), 'tokomawar.com')
        with self.assertRaises(core.StoreError):
            core.validate_admin('admin@example.test', 'a' * 15, 'a' * 15)
        self.assertEqual(core.validate_admin('admin@example.test', 'Aa9!' * 4, 'Aa9!' * 4), 'admin@example.test')

    def test_additive_allowlist_blocks_destructive_and_code_execution(self):
        core_sql = 'CREATE TABLE "ReleaseNote" ("id" TEXT NOT NULL PRIMARY KEY, "note" TEXT);'
        updater.validate_additive(core_sql)
        updater.validate_additive('ALTER TABLE "Product" ADD COLUMN "extra" TEXT;')
        for sql in ['DROP TABLE "Product";', 'DELETE FROM "Product";', 'ALTER TABLE "Product" ADD COLUMN "x" TEXT NOT NULL;', 'CREATE UNIQUE INDEX "x" ON "Product" ("name");', 'CREATE TABLE "x" ("y" TEXT DEFAULT dangerous());', 'DO $$ BEGIN END $$;', core_sql + ' DROP TABLE "User";', 'CREATE TABLE "x" ("a" TEXT REFERENCES "User"("id"));']:
            with self.assertRaises(core.StoreError, msg=sql):
                updater.validate_additive(sql)

    def test_unsafe_archive_entries_are_rejected_before_extraction(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/etc/file', tarfile.REGTYPE), ('app/./file', tarfile.REGTYPE), ('app/link', tarfile.SYMTYPE), ('app\\file', tarfile.REGTYPE)]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w') as archive:
                info = tarfile.TarInfo(name)
                info.type = kind
                archive.addfile(info, io.BytesIO())
            data.seek(0)
            with tarfile.open(fileobj=data) as archive, self.assertRaises(core.StoreError):
                updater.safe_members(archive)

    def test_secret_generation_recovery_preserves_existing_credentials(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(core, 'CONFIG', Path(directory)):
            core.create_secrets('mawar.example.com')
            initial = (Path(directory) / 'postgres.env').read_text()
            runtime = (Path(directory) / 'runtime.env').read_text()
            contents = {name: (Path(directory) / name).read_text() for name in ['postgres.env', 'runtime.env', 'migration.env', 'init.sql']}
            core.atomic_json(Path(directory) / 'secret-journal.json', contents)
            (Path(directory) / 'migration.env').unlink()
            core.create_secrets('melati.example.com')
            self.assertEqual((Path(directory) / 'postgres.env').read_text(), initial)
            changed = (Path(directory) / 'runtime.env').read_text()
            self.assertEqual(runtime.split('JWT_SECRET=')[1].splitlines()[0], changed.split('JWT_SECRET=')[1].splitlines()[0])
            self.assertIn('https://melati.example.com', changed)
            self.assertFalse((Path(directory) / 'secret-journal.json').exists())


if __name__ == '__main__':
    unittest.main()
