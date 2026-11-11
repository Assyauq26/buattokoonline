"""Preserve operator-reviewed historical SQL bytes without changing the DB ledger.

The artifact is verified in its original form first. A narrowly scoped, root-owned
pair of old/new digests may then preserve an installed migration's original CRLF
bytes. No SQL change, generic checksum bypass, or ledger rewrite is permitted.
"""
import copy
import hashlib
import json
from pathlib import Path
import re
import tarfile
import core
import updater
from .trust import Rejected


def extract(package, destination, release, installed, config):
    if not config.get('migrationCompatibility'):
        return updater.extract_package(package, destination, release, installed)
    rules = core.read_json(config['migrationCompatibility'])
    if not isinstance(rules, dict) or len(rules) > 50:
        raise Rejected('migration_compatibility')
    baseline = core.read_json(config['baseline'])
    compatible = copy.deepcopy(installed)
    preserved = {}
    with tarfile.open(package, 'r:gz') as archive:
        updater.safe_members(archive)
        member = archive.getmember('release.json')
        if member.size > 2 * 1024 * 1024: raise Rejected('manifest_size')
        manifest = json.load(archive.extractfile(member))
        for name, old_digest in installed['migrations'].items():
            new_digest = manifest['migrations'].get(name)
            if new_digest == old_digest: continue
            rule = rules.get(name)
            if (not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name)
                or rule != {'installed': old_digest, 'artifact': new_digest}
                or not isinstance(new_digest, str)
                or not re.fullmatch('[a-f0-9]{64}', new_digest)):
                raise Rejected('migration_history')
            relative = 'app/prisma/migrations/' + name + '/migration.sql'
            old_path = Path(baseline['root']) / relative
            if old_path.is_symlink() or baseline['files'].get(relative) != old_digest:
                raise Rejected('migration_history')
            old = old_path.read_bytes()
            fresh = archive.extractfile(relative).read()
            if (hashlib.sha256(old).hexdigest() != old_digest
                or hashlib.sha256(fresh).hexdigest() != new_digest
                or old.replace(b'\r\n', b'\n') != fresh.replace(b'\r\n', b'\n')):
                raise Rejected('migration_history')
            from historical_migrations import authorize
            record = authorize(name, old, fresh, installed,
                {'installation': config.get('installation'), 'origin': config.get('origin')},
                core.CONFIG / 'migration-compatibility/v1.7.2.tar.gz', release['version'])
            print('HISTORICAL_MIGRATION_COMPATIBILITY ' + json.dumps(record, sort_keys=True), flush=True)
            compatible['migrations'][name] = new_digest
            preserved[relative] = (name, old, old_digest, new_digest)
    manifest = updater.extract_package(package, destination, release, compatible)
    # Keep the authenticated original archive intact. The effective runtime
    # inventory and precise transformation are separately journaled by the worker.
    effective = copy.deepcopy(manifest)
    effective['preservedMigrationBytes'] = {}
    for relative, (name, old, old_digest, new_digest) in preserved.items():
        (destination / relative).write_bytes(old)
        effective['files'][relative] = old_digest
        effective['migrations'][name] = old_digest
        effective['preservedMigrationBytes'][name] = {'installed': old_digest, 'artifact': new_digest}
    return effective
