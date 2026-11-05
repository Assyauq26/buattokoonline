"""Two unsigned disposable packages, usable only by the updater's isolated CI mode."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

source = Path('/tmp/single-store-clone')
sys.path.insert(0, str(source / 'installer'))
import release
import core

fixture = Path('/tmp/store-release-fixture')
subprocess.run(['git', 'clone', '--no-local', str(source), str(fixture)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for version, name in [('1.0.1', '20261106000001_store_update_probe'), ('1.0.2', '20261106000002_store_failure_probe')]:
    (fixture / 'VERSION').write_text(version + '\n')
    migration = fixture / 'app/prisma/migrations' / name
    migration.mkdir()
    table = 'StoreUpdateProbe' if version == '1.0.1' else 'StoreFailureProbe'
    (migration / 'migration.sql').write_text('CREATE TABLE "' + table + '" ("id" TEXT NOT NULL PRIMARY KEY, "note" TEXT);\n')
    if version == '1.0.2':
        dockerfile = fixture / 'app/Dockerfile'
        dockerfile.write_text(dockerfile.read_text() + '\nCMD ["node", "-e", "process.exit(1)"]\n')
    package = Path('/tmp/store-v' + version + '.tar.gz')
    manifest = release.pack(fixture, package, fixture=True)
    metadata = {'package': str(package), 'release': {'version': version, 'sha': manifest['source_sha'], 'digest': hashlib.sha256(package.read_bytes()).hexdigest(), 'notes': 'Disposable compatible CI version ' + version}}
    core.atomic_json(Path('/tmp/store-v' + version + '.json'), metadata)
