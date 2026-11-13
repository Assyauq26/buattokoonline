"""Operator bootstrap shared by old/new installs. Produces a reversible plan.

Never downloads its own trust root. The operator supplies an authenticated public
key bundle. Applying the plan/reloading Caddy is a separate explicit operation.
"""
import copy
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
from urllib.parse import urlparse
import core
from .trust import Rejected

CATALOG = 'https://buattokosendiri.web.id/api/platform/store-releases'

def plan(compose, origin, installation, address):
    if not re.fullmatch('[a-f0-9]{32}', installation): raise Rejected('installation_id')
    host = urlparse(origin)
    if host.scheme != 'https' or host.path or host.port or not re.fullmatch('[a-z0-9.-]+', host.hostname or ''): raise Rejected('origin')
    ip = ipaddress.ip_address(address)
    if ip.version != 4 or not ip.is_private or ip.is_unspecified or ip.is_loopback: raise Rejected('status_address')
    candidate = copy.deepcopy(compose)
    app = candidate['services']['app']
    if app.get('user') not in [None, '1000:1000', '1000']: raise Rejected('application_user')
    volumes = app.setdefault('volumes', [])
    additions = [
        '/run/single-store-updater:/run/store-updater:ro',
        '/etc/single-store/updater/control-token:/run/store-updater-token:ro',
    ]
    for mount in volumes:
        if not isinstance(mount, str): raise Rejected('operator_volume_review')
        if any(mount.split(':')[1] == item.split(':')[1] and mount != item for item in additions): raise Rejected('conflicting_mount')
    volumes.extend(item for item in additions if item not in volumes)
    app.setdefault('environment', {}).update(STORE_UPDATER_ENABLED='1', STORE_INSTALLATION_ID=installation)
    route = f'  handle /api/local-updater/status {{\n    reverse_proxy {address}:17841\n  }}\n'
    return candidate, route

def prepare(source, root_bundle, address, channel='stable', migration_compatibility=None, installed_copy=None):
    if os.geteuid() != 0: raise Rejected('operator_required')
    if channel not in ['stable', 'pilot']: raise Rejected('channel')
    source = Path(source).resolve()
    baseline_root=Path(installed_copy).resolve() if installed_copy else source
    if not (core.CONFIG/'installed').is_file(): raise Rejected('not_installed')
    if core.dc(['exec','-T','app','id','-u']) != '1000': raise Rejected('application_user')
    installed = core.read_json(core.CONFIG/'version.json')
    env = dict(line.split('=', 1) for line in (core.CONFIG/'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    roots = core.read_json(root_bundle)
    if not roots or any(not re.fullmatch('[a-z0-9-]{1,64}', k) or not v.startswith('-----BEGIN PUBLIC KEY-----') for k,v in roots.items()): raise Rejected('trust_roots')
    # Baseline must match the currently installed SHA; operator cannot silently
    # baseline another checkout and erase evidence of seller customizations.
    sha = core.run(['git', '-c', 'safe.directory='+str(source), '-C', source, 'rev-parse', 'HEAD'])
    if sha != installed['source_sha']: raise Rejected('baseline_sha')
    names = core.run(['git', '-c', 'safe.directory='+str(source), '-C', source, 'ls-files']).splitlines()
    files = {}
    for name in names:
        if not name.startswith('app/'): continue
        p = source/name
        if p.is_symlink() or not p.is_file(): raise Rejected('baseline_source')
        # Legacy migration byte checksums are verified separately, not rewritten.
        if '/migrations/' in name and name.endswith('/migration.sql'):
            if installed['migrations'].get(p.parent.name) != hashlib.sha256(p.read_bytes()).hexdigest(): raise Rejected('migration_history')
        else:
            expected = core.run(['git', '-c', 'safe.directory='+str(source), '-C', source, 'hash-object', '--path='+name, str(p)])
            tracked = core.run(['git', '-c', 'safe.directory='+str(source), '-C', source, 'rev-parse', 'HEAD:'+name])
            if expected != tracked: raise Rejected('local_customization')
        actual=baseline_root/name
        if actual.is_symlink() or not actual.is_file() or actual.read_bytes()!=p.read_bytes():raise Rejected('installed_source_mismatch')
        files[name] = hashlib.sha256(actual.read_bytes()).hexdigest()
    folder = core.CONFIG/'updater'; folder.mkdir(mode=0o700, exist_ok=True)
    config_file = folder/'config.json'
    if config_file.exists():
        config = core.read_json(config_file)
        if config['origin'] != env['APP_ORIGIN']: raise Rejected('installation_mismatch')
        return config # Explicit separate updater upgrade required; never overwrite running worker.
    installation = secrets.token_hex(16)
    agent_config = Path('/etc/btos-agent/config.json')
    if agent_config.is_file() and not agent_config.is_symlink():
        enrolled = core.read_json(agent_config)
        agent_id = enrolled.get('installationId', '')
        if (re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', agent_id)
                and enrolled.get('storeOrigin') == env['APP_ORIGIN']):
            # New installations share the agent identity in the updater's
            # existing hex representation. Existing updater state is retained above.
            installation = agent_id.replace('-', '')
    candidate, route = plan(core.read_json(core.COMPOSE), env['APP_ORIGIN'], installation, address)
    for path in [core.DATA/'updater', core.DATA/'updater/jobs', Path('/var/backups/single-store')]: path.mkdir(mode=0o700, parents=True, exist_ok=True)
    config = {'installation':installation,'origin':env['APP_ORIGIN'],'channel':channel,'catalog':CATALOG,'statusAddress':address,
        'trust':str(folder/'trust.json'),'controlToken':str(folder/'control-token'),'baseline':str(folder/'baseline.json'),
        'database':str(core.DATA/'updater/state.sqlite'),'jobs':str(core.DATA/'updater/jobs')}
    core.atomic_json(folder/'trust.json', roots)
    if migration_compatibility:
        rules = core.read_json(migration_compatibility)
        if not isinstance(rules, dict) or len(rules) > 50: raise Rejected('migration_compatibility')
        for name, rule in rules.items():
            if (not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name)
                or not isinstance(rule, dict) or set(rule) != {'installed', 'artifact'}
                or rule['installed'] != installed['migrations'].get(name)
                or any(not isinstance(v,str) or not re.fullmatch('[a-f0-9]{64}',v) for v in rule.values())):
                raise Rejected('migration_compatibility')
        core.atomic_json(folder/'migration-compatibility.json', rules)
        config['migrationCompatibility'] = str(folder/'migration-compatibility.json')
    token = folder/'control-token'; token.write_text(secrets.token_hex(32)); token.chmod(0o440); os.chown(token,0,1000)
    core.atomic_json(folder/'baseline.json', {'root':str(baseline_root),'files':files})
    core.atomic_json(folder/'compose.before.json', core.read_json(core.COMPOSE))
    core.atomic_json(folder/'compose.prepared.json', candidate)
    (folder/'status-route.caddy').write_text(route)
    shutil.copy2(core.CONFIG/'Caddyfile', folder/'Caddyfile.before')
    # Pin worker independently. A store release does not replace this code.
    worker = core.ROOT/'updater'; worker.mkdir(mode=0o700, exist_ok=True)
    # Resume an interrupted copy only when every existing byte agrees with this
    # bootstrap. Never replace an independently upgraded worker or follow links.
    sources = {Path('update_service')/p.name:p for p in Path(__file__).parent.glob('*.py')}
    sources.update({Path(n):Path(__file__).parent.parent/n for n in ['core.py','updater.py','promotions_transition.py','historical_migrations.py']})
    for p in worker.rglob('*'):
        if p.is_symlink() or (p.is_file() and (p.relative_to(worker) not in sources or p.read_bytes()!=sources[p.relative_to(worker)].read_bytes())):
            raise Rejected('existing_updater_review')
    for relative, original in sources.items():
        destination=worker/relative;destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        if not destination.exists():shutil.copy2(original,destination)
    core.atomic_json(config_file, config)
    return config

if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--trust',required=True);p.add_argument('--status-address',required=True);p.add_argument('--channel',choices=['pilot','stable'],default='stable');p.add_argument('--migration-compatibility')
    a=p.parse_args()
    prepare(a.source,a.trust,a.status_address,a.channel,a.migration_compatibility)
    print('Prepared root-only configuration and rollback copies. Service and proxy are not activated.')
