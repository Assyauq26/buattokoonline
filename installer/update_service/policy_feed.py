"""A separately signed policy travels inside the existing signed catalog.

Old v2 catalog parsers ignore the extra field and still reject the false
rollback flag/minimum worker 3. No new endpoint or public trust bootstrap.
"""
import json
import time
import core
from . import VERSION
from .trust import Rejected, verify, version
from .upgrade_policy import authenticate, bind


def authorized(release, installed, config, state, catalog=None):
    if not catalog or catalog['expiresAt'] <= time.time() or release['sha'] in catalog['revoked']:
        raise Rejected('catalog_unavailable')
    match = next((r for r in catalog['releases'] if r['sha'] == release['sha']), None)
    if not match or any(match.get(k) != release.get(k) for k in ('digest','version','size','url','minimumUpdater','rollbackCompatible','dbContract')):
        raise Rejected('release_not_available')
    if match['channel']=='pilot' and config['channel']!='pilot':raise Rejected('release_not_available')
    if match['minimumUpdater']>VERSION:raise Rejected('worker_upgrade_required')
    raw = match.get('upgradePolicy')
    if not isinstance(raw, dict): raise Rejected('operator_migration_required')
    policy, digest = authenticate(json.dumps(raw).encode(), core.read_json(config.get('policyTrust',config['trust'])))
    state.policy(policy,digest)
    # Native adapter supports only the independently reviewed published pair.
    if (policy['fromVersion'],policy['toVersion'],policy['sourceSha'],policy['artifactDigest']) != (
        '1.7.4','1.8.0','7e81f8e60b27ab5695ac50ac6b653b63095e36d1',
        '2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223'):
        raise Rejected('upgrade_path_unsupported')
    if policy.get('format') != 2: raise Rejected('policy_baseline_required')
    if (match['minimumInstalledVersion']!=policy['fromVersion'] or match['maximumInstalledVersion']!=policy['fromVersion']
        or match['minimumUpdater']<policy['minimumWorker']):raise Rejected('manifest_compatibility')
    if installed['source_sha'] != policy['fromSourceSha']: raise Rejected('policy_baseline_mismatch')
    bind(policy,release,installed,policy['baselineAppTree'],installed['migrations'],VERSION)
    cohort = policy['installations']
    if cohort!=['*'] and config['installation'] not in cohort: raise Rejected('installation_not_in_pilot')
    return policy


def fresh(config,state,release,installed):
    # Reauthenticate at execution/recovery; a queued job cannot pin revoked data.
    cat=current_catalog(config,state)
    return authorized(release,installed,config,state,cat)


def current_catalog(config,state):
    from .server import NoRedirect
    from urllib.request import build_opener, Request
    with build_opener(NoRedirect()).open(Request(config['catalog'],headers={'User-Agent':'BTOS-Updater/3'}),timeout=8) as response:
        raw=response.read(1024*1024+1)
    cat=verify(raw,core.read_json(config['trust']));state.catalog(cat)
    return cat


def compatible_current(config,state,release,installed):
    cat=current_catalog(config,state)
    match=next((r for r in cat['releases'] if r['sha']==release['sha']),None)
    if not match or match['sha'] in cat['revoked'] or any(match.get(k)!=release.get(k) for k in ('version','digest','size','url','rollbackCompatible','minimumInstalledVersion','maximumInstalledVersion','minimumUpdater','dbContract')):raise Rejected('release_not_available')
    if match['channel']=='pilot' and config['channel']!='pilot':raise Rejected('release_not_available')
    if not match['rollbackCompatible'] or match['minimumUpdater']>VERSION:raise Rejected('incompatible_release')
    if match['dbContract']!=installed['db_contract'] or not version(match['minimumInstalledVersion'])<=version(installed['version'])<=version(match['maximumInstalledVersion']):raise Rejected('incompatible_release')
    return match
