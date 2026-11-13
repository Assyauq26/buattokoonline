"""Reversible, validated routes for authenticated app-independent update status."""
import hashlib
import ipaddress
import json
from pathlib import Path
import core
from .activate import validate_proxy,write_proxy
from .trust import Rejected

PATHS=('/admin/settings/updates','/api/local-updater/session-status')


def routes(config,include_ticket=True):
    address=ipaddress.ip_address(config['statusAddress'])
    if not address.is_private or address.is_unspecified or address.is_loopback:raise Rejected('status_address')
    port=config.get('statusPort',17841)
    if type(port)!=int or not 1024<=port<=65535:raise Rejected('status_address')
    paths=('/api/local-updater/status',*PATHS) if include_ticket else PATHS
    return ''.join('  handle '+p+' {\n    reverse_proxy '+str(address)+':'+str(port)+'\n  }\n' for p in paths)


def enable(config,backup,resume=False):
    backup=Path(backup);backup.mkdir(mode=0o700,exist_ok=resume)
    proxy=core.CONFIG/'Caddyfile';cfg=core.CONFIG/'updater/config.json'
    previous=proxy.read_bytes();old=cfg.read_bytes()
    if json.loads(old)!=config:raise Rejected('configuration_changed')
    if (backup/'Caddyfile').exists() and (backup/'Caddyfile').read_bytes()!=previous:raise Rejected('proxy_changed_requires_review')
    if (backup/'config.json').exists() and core.read_json(backup/'config.json')!=config:raise Rejected('configuration_changed')
    (backup/'Caddyfile').write_bytes(previous);core.atomic_json(backup/'config.json',json.loads(old))
    text=previous.decode();marker=config['origin']+' {'
    if text.count(marker)!=1 or text.count('/api/local-updater/status')!=1:raise Rejected('proxy_review_required')
    if any(path in text for path in PATHS):raise Rejected('proxy_review_required')
    candidate=text.replace(marker,marker+'\n'+routes(config,False),1)
    handle=b'  handle {\n    reverse_proxy app:3000\n  }\n'
    if candidate.encode().count(handle)!=1:raise Rejected('proxy_review_required')
    maintenance=candidate.encode().replace(handle,b'  handle {\n    respond "Toko sedang disiapkan oleh pemilik server." 503\n  }\n',1)
    new={**config,'approvedProxyHashes':{'live':hashlib.sha256(candidate.encode()).hexdigest(),'maintenance':hashlib.sha256(maintenance).hexdigest()}}
    if (backup/'Caddyfile.after').exists() and (backup/'Caddyfile.after').read_bytes()!=candidate.encode():raise Rejected('proxy_changed_requires_review')
    if (backup/'config.after.json').exists() and core.read_json(backup/'config.after.json')!=new:raise Rejected('configuration_changed')
    (backup/'Caddyfile.after').write_bytes(candidate.encode());core.atomic_json(backup/'config.after.json',new)
    for path in backup.iterdir():
        path.chmod(0o600)
        with path.open('rb+') as f:__import__('os').fsync(f.fileno())
    validate_proxy(candidate)
    try:
        write_proxy(candidate)
        core.atomic_json(cfg,new)
    except BaseException:
        restore(backup);raise
    return str(backup)


def restore(backup):
    backup=Path(backup)
    validate_receipt(backup)
    text=(backup/'Caddyfile').read_text();validate_proxy(text);write_proxy(text)
    core.atomic_json(core.CONFIG/'updater/config.json',json.loads((backup/'config.json').read_text()))


def validate_receipt(backup):
    backup=Path(backup)
    if (core.CONFIG/'Caddyfile').read_bytes() not in [(backup/p).read_bytes() for p in ('Caddyfile','Caddyfile.after')]:raise Rejected('proxy_changed_requires_review')
    if core.read_json(core.CONFIG/'updater/config.json') not in [core.read_json(backup/p) for p in ('config.json','config.after.json')]:raise Rejected('configuration_changed')


def finish(backup):
    backup=Path(backup);validate_receipt(backup)
    text=(backup/'Caddyfile.after').read_text();validate_proxy(text);write_proxy(text)
    core.atomic_json(core.CONFIG/'updater/config.json',core.read_json(backup/'config.after.json'))
