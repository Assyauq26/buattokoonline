"""Read-only, exact Hubify v1.8.0 transition review. Never an apply authorization.

Byte equivalence is deliberately separate from migration execution. This module
does not call migrate, normalize files, modify a ledger, or relax updater policy.
The installed staging helper must continue to reject J&T Production.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import tarfile

import core
import historical_migrations as history
import updater

BASE_SOURCE = 'c67fb49da284d51618524812d83974de70526657'
BASE_TREE = '476df370f9fc9595d00040b3309ee51f883148cb'
BASE_IMAGE = 'sha256:52ecc4f33d3c856191428d12bc21806c4df23321d73d49f209933bc183516356'
BASE_ARCHIVE = '0a286296c0c85e5e320f85043e85dede0213e013dae129351a374df35f586b4e'
BASE_RELEASE_SOURCE = 'c3cfb22fb03bc3bea37aadfb6d790c75e805d51b'
BASE_SCHEMA = '7bf82245b86cd80c7a1d38aa374538210ff19df871548da773549785de448ef1'
NEW_NAME = '20261112050000_promotion_sku_offers'
NEW_SQL = '0b43da5d78a6c9211c4fef32bf8d5a813e2e335992035f8923db64f50a35b2f7'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, reason):
    if not condition:
        raise core.StoreError('PROMOTIONS_TRANSITION_REJECTED: ' + reason)


def package(path, expected_digest, source_sha, version):
    """Authenticate a complete source package without extracting any member."""
    path = Path(path)
    require(not path.is_symlink() and path.is_file(), 'regular archive required')
    require(re.fullmatch('[a-f0-9]{64}', expected_digest) is not None, 'exact archive digest')
    require(digest(path.read_bytes()) == expected_digest, 'archive digest mismatch')
    with tarfile.open(path, 'r:gz') as archive:
        members = updater.safe_members(archive)
        files = {name: archive.extractfile(name).read() for name in members}
    require('release.json' in files, 'manifest missing')
    manifest = json.loads(files.pop('release.json'))
    require(manifest.get('format') == 1 and manifest.get('repository') == core.REPO
            and manifest.get('repository_id') == core.REPO_ID, 'repository identity')
    require(manifest.get('source_sha') == source_sha and re.fullmatch('[a-f0-9]{40}', source_sha)
            and manifest.get('version') == version and manifest.get('tag') == 'v' + version,
            'source/version identity')
    require(manifest.get('files') == {p: digest(b) for p, b in files.items()}, 'full file inventory')
    migrations = {Path(p).parent.name: digest(b) for p, b in files.items()
                  if re.fullmatch(r'app/prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration.sql', p)}
    require(manifest.get('migrations') == migrations, 'migration inventory')
    require(files.get('VERSION') == (version + '\n').encode(), 'VERSION bytes')
    return manifest, files


def runtime_paths(files):
    # These exact directories are excluded by the authenticated baseline Dockerfile.
    return {p for p in files if p.startswith('app/')
            and not p.startswith(('app/tests/', 'app/resources/'))}


def review(observation, runtime, schema, baseline, candidate, context):
    """Accept only the observed installation and two original legacy byte pairs.

    Inputs must be freshly collected by an operator before an actual cutover.
    An offline JSON report is evidence for review, not an execution token.
    """
    old_manifest, old_files = baseline
    new_manifest, new_files = candidate
    require(context == {'installation': history.INSTALLATION, 'origin': 'https://hubify.web.id'},
            'installation/origin')
    installed = observation['version']
    require(installed.get('version') == '1.7.3' and installed.get('source_sha') == BASE_SOURCE
            and installed.get('channel') == 'hubify-staging' and installed.get('db_contract') == 1,
            'actual installed metadata')
    require(observation.get('source_commit') == BASE_SOURCE and observation.get('app_tree') == BASE_TREE
            and observation.get('source_version') == '1.7.3', 'actual source identity')
    app = [c for c in observation['containers'] if c['service'] == 'app']
    require(len(app) == 1 and app[0]['image'] == BASE_IMAGE and app[0]['running']
            and app[0]['health'] == 'healthy', 'actual image/health')
    env = observation['app_environment']
    require(env.get('STORE_BUILD_SHA') == BASE_SOURCE and env.get('STORE_INSTALLED_VERSION') == '1.7.3',
            'runtime metadata')
    require(old_manifest['source_sha'] == BASE_RELEASE_SOURCE and old_manifest['version'] == '1.7.4'
            and len(old_manifest['migrations']) == 29, 'published baseline')
    require(digest(json.dumps(schema, sort_keys=True, separators=(',', ':')).encode()) == BASE_SCHEMA,
            'actual schema drift')
    expected = dict(old_manifest['migrations'])
    accepted = []
    for name, (legacy, canonical) in history.PAIRS.items():
        path = 'app/prisma/migrations/' + name + '/migration.sql'
        fresh = old_files[path]
        records = observation['historical_files'][name]
        raw = base64.b64decode(records['original']['base64'], validate=True)
        active = base64.b64decode(records['active']['base64'], validate=True)
        require(digest(fresh) == canonical and digest(raw) == legacy and active == raw
                and raw != fresh and raw.replace(b'\r\n', b'\n') == fresh,
                'substantive or unrecognized historical bytes: ' + name)
        expected[name] = legacy
        accepted.append({'migration': name, 'ledger': legacy, 'canonical': canonical,
                         'original_bytes': len(raw), 'canonical_bytes': len(fresh)})
    ledger = observation['database']['ledger']
    require(len(ledger) == 29 and len({r['migration_name'] for r in ledger}) == 29
            and all(r['finished'] and not r['rolled_back'] for r in ledger),
            'duplicate/unfinished/rolled-back/missing history')
    actual = {r['migration_name']: r['checksum'] for r in ledger}
    require(actual == expected == installed.get('migrations') == observation.get('source_inventory'),
            'ledger/source/metadata inventory mismatch')
    paths = runtime_paths(old_files)
    require(len(paths) == 552, 'baseline runtime set changed')
    require(set(runtime) == paths, 'missing/extra runtime files')
    for path in paths:
        value = runtime[path]
        wanted = expected.get(Path(path).parent.name) if path.endswith('/migration.sql') else digest(old_files[path])
        require(value.get('sha256') == wanted, 'runtime differs: ' + path)
    require(new_manifest.get('version') == '1.8.0', 'target version')
    require(new_manifest['migrations'] == {**old_manifest['migrations'], NEW_NAME: NEW_SQL},
            'target changes historical SQL or adds unreviewed SQL')
    require(digest(new_files['app/prisma/migrations/' + NEW_NAME + '/migration.sql']) == NEW_SQL,
            'unreviewed new migration bytes')
    for name in old_manifest['migrations']:
        path = 'app/prisma/migrations/' + name + '/migration.sql'
        require(new_files[path] == old_files[path], 'historical bytes changed: ' + name)
    require(new_manifest['compatibility'] == {
        'db_contract': 1, 'minimum_installed_contract': 1, 'maximum_installed_contract': 1,
        'postgres_major': 16, 'rollback_compatible': False,
        'minimum_installed_version': '1.7.4', 'maximum_installed_version': '1.7.4'}, 'policy weakened')
    require(json.loads(new_files['release-policy.json']) == new_manifest['compatibility'], 'policy metadata mismatch')
    # A plan is explicitly NOT approval to run the staging helper on Production.
    return {
        'transition': 'hubify-c67-v173-to-promotions-v180',
        'equivalence_accepted': True, 'migration_execution': 'not_started',
        'deployment_allowed': False, 'decision': 'NO-GO', 'production_writes': False,
        'from': {'version': '1.7.3', 'source_sha': BASE_SOURCE, 'image': BASE_IMAGE},
        'observed_production_guards': {k: env.get(k) for k in
            ['JNT_PRODUCTION_API_APPROVED', 'JNT_PRODUCTION_ORDER_APPROVED', 'JNT_ENABLE_ORDER_CREATE']},
        'payload_equivalent_to': '1.7.4', 'runtime_files_verified': len(paths),
        'schema_sha256': BASE_SCHEMA, 'historical_equivalence': accepted,
        'migration_plan': {'name': NEW_NAME, 'sha256': NEW_SQL, 'command': 'prisma migrate deploy',
                           'historical_files': 'canonical, unchanged', 'historical_ledger': 'retain raw checksums'},
        'proposed_metadata_after_healthy_activation': {
            'version': '1.8.0', 'source_sha': new_manifest['source_sha'],
            'db_contract': 1, 'migrations': {**expected, NEW_NAME: NEW_SQL}},
        'blockers': [
            'Installed staging helper rejects J&T Production; keep approvals and guard intact.',
            'Generic updater rejects rollback_compatible=false and actual 1.7.3 baseline.',
            'A reviewed production cutover/recovery executor is required; this review is not an apply token.',
            'Separate merge/deployment/publication authorization and mandatory release gates required.',
        ],
    }
