"""Exact, installation-bound historical byte compatibility. No ledger writes."""
import hashlib
import json
from pathlib import Path
import tarfile
import core

BASE_SHA = '5145bdcd7cd84f93f49a066aa669560e858db0ac'
# Proposed Hubify-only continuation for PR #43. Approval is required before
# installing this module. Pin the known deployed release and the complete app
# tree, rather than permitting arbitrary future v1.7.3 deployments.
V173_UI_BASE_SHA = 'b8b33ebecec3f1c9798b7148f0f407da142afb46'
V173_UI_APP_TREE = '79de568eb19b30baaefe99b2023500aa7ceab82d'
# Proposed next transition for PR #45, separately reviewed before installation.
# Keep each deployed source paired with only its reviewed destination app tree.
V173_SHEETS_BASE_SHA = 'f6ce29b03f994f3dc7d3368912737ca1d2aca99b'
V173_SHEETS_APP_TREE = '307668134ed5b0f4057331ea652e128eccb5808e'
# Reviewed Hubify-only transition for the product deletion and seller UI update.
V173_DELETE_BASE_SHA = 'f7da54d24e92241326ea58472d4d2012bfe791d0'
V173_DELETE_APP_TREE = '476df370f9fc9595d00040b3309ee51f883148cb'
ARCHIVE_SHA = 'dd7d400a3821e4fc20b6886f688ee48c46300a440344b0e06978e32313dad938'
INSTALLATION = '2d958c50e7a60006f3a8531cf217335e'
PAIRS = {
    '20261109120000_order_resolution_workflow': (
        '789ef757b2cb2fb6f6d38f710c6a50cfcb371d9b61e18e4154120930e02107ac',
        '865ec38af4482060322ba0dc89becc9132881d7bbb7f7e633b669af30e0444ec'),
    '20261109121500_resolution_transfer_review': (
        'd67b0094191575be2f28c7968e41eabad5bf9a9ab84676d8c66b7e7c01313483',
        '22cb34b1d3840926b42356fb333c0678f5a0ea850ee3c3b8b1f9373cc92a885b'),
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def authorize(name, old, fresh, installed, context, archive, target_version="1.7.3",
              source_app_tree=None):
    """Authenticate original bytes or the separately reviewed pinned UI redeploy."""
    reject = lambda: core.StoreError('Kompatibilitas migrasi historis tidak terverifikasi: ' + name)
    pair = PAIRS.get(name)
    original = (installed.get('version') == '1.7.2'
                and installed.get('source_sha') == BASE_SHA)
    transition = {
        (V173_UI_BASE_SHA, V173_UI_APP_TREE): 'v1.7.3-ui-pr43',
        (V173_SHEETS_BASE_SHA, V173_SHEETS_APP_TREE): 'v1.7.3-ui-pr45',
        (V173_DELETE_BASE_SHA, V173_DELETE_APP_TREE): 'v1.7.3-product-deletion',
    }.get((installed.get('source_sha'), source_app_tree))
    ui_redeploy = (installed.get('version') == '1.7.3'
                   and transition is not None
                   and installed.get('channel') == 'hubify-staging'
                   and installed.get('candidate_version') == '1.7.3')
    if (target_version != '1.7.3' or pair is None or (digest(old), digest(fresh)) != pair
            or not (original or ui_redeploy)
            or installed.get('db_contract') != 1
            or context != {'installation': INSTALLATION, 'origin': 'https://hubify.web.id'}
            or installed.get('migrations', {}).get(name) != pair[0]
            or old == fresh or old.replace(b'\r\n', b'\n') != fresh):
        raise reject()
    archive = Path(archive)
    if archive.is_symlink() or digest(archive.read_bytes()) != ARCHIVE_SHA:
        raise reject()
    with tarfile.open(archive, 'r:gz') as tar:
        names = tar.getnames()
        if len(names) != len(set(names)):
            raise reject()
        manifest = json.load(tar.extractfile('release.json'))
        history = dict(manifest.get('migrations', {}))
        for migration, hashes in PAIRS.items():
            if history.get(migration) != hashes[1]:
                raise reject()
            history[migration] = hashes[0]
        if installed.get('migrations') != history:
            raise reject()
        relative = 'app/prisma/migrations/' + name + '/migration.sql'
        if (manifest.get('source_sha') != BASE_SHA or manifest.get('version') != '1.7.2'
                or manifest.get('repository') != core.REPO
                or manifest.get('repository_id') != core.REPO_ID
                or manifest.get('migrations', {}).get(name) != pair[1]
                or manifest.get('files', {}).get(relative) != pair[1]
                or tar.extractfile(relative).read() != fresh):
            raise reject()
    record = {'migration': name, 'installed': pair[0], 'artifact': pair[1],
            'installation': INSTALLATION, 'history': BASE_SHA,
            'evidence_archive': ARCHIVE_SHA}
    if ui_redeploy:
        record.update(transition=transition, installed_source=installed['source_sha'],
                      application_tree=source_app_tree)
    return record

def runtime_context():
    config = core.read_json(core.CONFIG / 'updater/config.json')
    state = core.read_json(core.STATE)
    if state.get('domain') != 'hubify.web.id' or not state.get('complete') or state.get('local_test'):
        raise core.StoreError('Identitas instalasi historis tidak sesuai.')
    return {'installation': config.get('installation'), 'origin': config.get('origin')}

def validate_source(source, installed):
    """Validate candidate inventory and retain actual historical ledger digests."""
    candidate = core.inventory(source)
    effective = dict(candidate)
    records = []
    source_app_tree = None
    for name, previous in installed['migrations'].items():
        if candidate.get(name) == previous:
            continue
        if name not in PAIRS or candidate.get(name) != PAIRS[name][1]:
            raise core.StoreError('Migrasi existing berubah atau hilang: ' + name)
        relative = Path('app/prisma/migrations') / name / 'migration.sql'
        old_path = core.ROOT / 'development-sources' / BASE_SHA / relative
        fresh_path = Path(source) / relative
        if old_path.is_symlink() or fresh_path.is_symlink():
            raise core.StoreError('File migrasi historis harus regular.')
        if installed.get('version') == '1.7.3' and source_app_tree is None:
            source_app_tree = core.run(['git', '-C', source, 'rev-parse', '--verify', 'HEAD:app'])
        record = authorize(name, old_path.read_bytes(), fresh_path.read_bytes(), installed,
                           runtime_context(), core.CONFIG / 'migration-compatibility/v1.7.2.tar.gz',
                           (Path(source) / 'VERSION').read_text().strip(), source_app_tree)
        effective[name] = previous
        records.append(record)
    return effective, records


def prepare_runtime_projection(source, installed):
    """Copy audited applied bytes only into a new, isolated runtime checkout."""
    source = Path(source).resolve()
    allowed = (core.ROOT / 'staging-sources').resolve()
    if not source.is_relative_to(allowed) or source == allowed:
        raise core.StoreError('Proyeksi migrasi hanya untuk checkout deployment baru.')
    effective, records = validate_source(source, installed)
    for record in records:
        relative = Path('app/prisma/migrations') / record['migration'] / 'migration.sql'
        original = core.ROOT / 'development-sources' / BASE_SHA / relative
        target = source / relative
        # Validation just authenticated both raw representations. Recheck before
        # writing to defend against an accidental change between the two steps.
        old, fresh = original.read_bytes(), target.read_bytes()
        if digest(old) != record['installed'] or digest(fresh) != record['artifact']:
            raise core.StoreError('Source migrasi berubah selama persiapan.')
        target.write_bytes(old)
    if core.inventory(source) != effective:
        raise core.StoreError('Proyeksi runtime tidak cocok dengan ledger.')
    return records
