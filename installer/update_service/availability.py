"""Explain signed releases without granting execution authority.

Discovery and authorization deliberately differ. In particular, a newer release
must remain visible when its migration cannot be executed by this worker.
"""
from .trust import version


def upgrade_path(catalog, installed, target, channel, worker, forward_ready=None):
    """Plan only published, nonrevoked, rollback-compatible edges. No apply."""
    queue = [(installed['version'], [])]
    seen = set()
    while queue:
        current, steps = queue.pop(0)
        if current == target: return steps
        if current in seen: continue
        seen.add(current)
        for r in sorted(catalog['releases'], key=lambda r: version(r['version'])):
            if (r['sha'] not in catalog['revoked'] and (r['rollbackCompatible'] or (forward_ready is not None and r['sha'] in forward_ready and forward_ready[r['sha']] is None))
                and r['minimumUpdater'] <= worker and r['dbContract'] == installed['db_contract']
                and (r['channel'] == 'stable' or channel == 'pilot')
                and version(current) < version(r['version']) <= version(target)
                and version(r['minimumInstalledVersion']) <= version(current) <= version(r['maximumInstalledVersion'])):
                queue.append((r['version'], steps + [r['sha']]))
    return None


def availability(catalog, installed, channel, worker, valid=True, forward_ready=None):
    if not valid:
        return {'state': 'check_required', 'latest': None, 'reason': 'catalog_unavailable'}
    releases = sorted((r for r in catalog['releases']
        if r['sha'] not in catalog['revoked']
        and (r['channel'] == 'stable' or channel == 'pilot')
        and version(r['version']) > version(installed['version'])),
        key=lambda r: version(r['version']), reverse=True)
    if not releases:
        return {'state': 'current', 'latest': None, 'reason': None}
    target = releases[0]
    reason = None
    if target['minimumUpdater'] > worker:
        reason = 'worker_upgrade_required'
    elif target['dbContract'] != installed['db_contract']:
        reason = 'database_contract_unsupported'
    elif not version(target['minimumInstalledVersion']) <= version(installed['version']) <= version(target['maximumInstalledVersion']):
        reason = 'upgrade_path_unsupported'
    elif not target['rollbackCompatible']:
        reason = (forward_ready or {}).get(target['sha'],'operator_migration_required')
    path = upgrade_path(catalog, installed, target['version'], channel, worker,forward_ready)
    if reason == 'upgrade_path_unsupported' and path:
        reason = None
    next_release = next((r for r in releases if path and r['sha'] == path[0]), None)
    return {'state': 'blocked' if reason else 'available',
        'latest': {k: target[k] for k in ('version', 'sha', 'notes')}, 'reason': reason,
        'nextRelease': {k: next_release[k] for k in ('version','sha','notes')} if next_release else None,
        'steps': len(path) if path else 0}
