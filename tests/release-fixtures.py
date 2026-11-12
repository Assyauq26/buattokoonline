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
major, minor, patch = map(int, (source / 'VERSION').read_text().strip().split('.'))
existing = core.inventory(source)
baseline_version = (source / 'VERSION').read_text().strip()
for offset, name in [(1, '20990101000001_store_update_probe'), (2, '20990101000002_store_failure_probe')]:
    assert name > max(existing, default=''), 'Disposable migration must follow the current inventory'
    version = f'{major}.{minor}.{patch + offset}'
    (fixture / 'VERSION').write_text(version + '\n')
    # Both disposable versions run this SAME application/schema baseline plus a
    # harmless probe table. Their rollback compatibility says nothing about the
    # real v1.7.4 -> v1.8.0 transition, whose policy remains false and is tested.
    policy = core.read_json(source / 'release-policy.json')
    policy.update(rollback_compatible=True, minimum_installed_version=baseline_version,
                  maximum_installed_version=f'{major}.{minor}.{patch + offset - 1}')
    (fixture / 'release-policy.json').write_text(json.dumps(policy) + '\n')
    migration = fixture / 'app/prisma/migrations' / name
    migration.mkdir()
    table = 'StoreUpdateProbe' if offset == 1 else 'StoreFailureProbe'
    (migration / 'migration.sql').write_text('CREATE TABLE "' + table + '" ("id" TEXT NOT NULL PRIMARY KEY, "note" TEXT);\n')
    if offset == 2:
        dockerfile = fixture / 'app/Dockerfile'
        dockerfile.write_text(dockerfile.read_text() + '\nCMD ["node", "-e", "process.exit(1)"]\n')
    package = Path('/tmp/store-v' + version + '.tar.gz')
    manifest = release.pack(fixture, package, fixture=True)
    metadata = {'package': str(package), 'release': {'version': version, 'sha': manifest['source_sha'], 'digest': hashlib.sha256(package.read_bytes()).hexdigest(), 'notes': 'Disposable compatible CI version ' + version}}
    core.atomic_json(Path('/tmp/store-v' + version + '.json'), metadata)
