"""Activate prepared updater on one installation, with validated proxy reload."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import time
import core
from .trust import Rejected
from .runtime import install

def add_route(contents, origin, route):
    marker = origin + ' {'
    if contents.count(marker) != 1: raise Rejected('proxy_site_review')
    if '/api/local-updater/status' in contents: raise Rejected('proxy_route_exists')
    return contents.replace(marker, marker+'\n'+route, 1)

def validate_proxy(contents):
    # Validation uses a temporary file inside the existing proxy; no shared
    # container recreation, DNS change, or application routing replacement.
    core.dc(['exec','-T','proxy','sh','-c','cat > /tmp/updater-candidate.caddy'], contents.encode())
    try: core.dc(['exec','-T','proxy','caddy','validate','--config','/tmp/updater-candidate.caddy','--adapter','caddyfile'])
    finally: core.dc(['exec','-T','proxy','rm','-f','/tmp/updater-candidate.caddy'])

def write_proxy(contents):
    # Preserve bind-mounted inode. Reload is explicit after validation.
    with open(core.CONFIG/'Caddyfile','w') as f:
        f.write(contents);f.flush();os.fsync(f.fileno())
    core.dc(['exec','-T','proxy','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])

def listener_ready(cfg):
    for _ in range(20):
        try:
            result=core.run(['curl','--noproxy','*','-sS','--max-time','2','-o','/dev/null','-w','%{http_code}','http://'+cfg['statusAddress']+':17841/api/local-updater/status'],timeout=3)
            if result=='401':return
        except Exception:pass
        time.sleep(0.5)
    raise Rejected('status_health')

def activate(unit):
    if os.geteuid()!=0:raise Rejected('operator_required')
    folder=core.CONFIG/'updater';cfg=core.read_json(folder/'config.json')
    with open('/run/single-store-operation.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if (folder/'activated.json').exists():
            core.run(['systemctl','is-active','--quiet','single-store-updater.service'])
            listener_ready(cfg)
            if (folder/'status-route.caddy').read_text() not in (core.CONFIG/'Caddyfile').read_text():raise Rejected('activation_drift')
            return
        old=(core.CONFIG/'Caddyfile').read_text()
        expected=(folder/'Caddyfile.before').read_text()
        if old!=expected or core.read_json(core.COMPOSE)!=core.read_json(folder/'compose.before.json'):raise Rejected('deployment_changed')
        new=add_route(old,cfg['origin'],(folder/'status-route.caddy').read_text())
        validate_proxy(new)
        unit_target=Path('/etc/systemd/system/single-store-updater.service')
        if unit_target.exists():raise Rejected('existing_updater_service')
        shutil.copy2(unit,unit_target)
        try:
            core.run(['systemctl','daemon-reload'])
            core.run(['systemctl','enable','--now','single-store-updater.service'])
            core.run(['systemctl','is-active','--quiet','single-store-updater.service'])
            # No unauthenticated data; verify listener can respond before cutover.
            listener_ready(cfg)
            write_proxy(new)
            core.atomic_json(core.COMPOSE,core.read_json(folder/'compose.prepared.json'))
            core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app'])
            core.healthy();core.public_health(core.read_json(core.STATE))
            core.atomic_json(folder/'activated.json',{'installation':cfg['installation'],'origin':cfg['origin']})
        except Exception:
            core.atomic_json(core.COMPOSE,core.read_json(folder/'compose.before.json'))
            write_proxy(old)
            core.dc(['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','app'])
            core.run(['systemctl','disable','--now','single-store-updater.service'])
            unit_target.unlink()
            core.run(['systemctl','daemon-reload'])
            core.healthy();core.public_health(core.read_json(core.STATE))
            raise Rejected('activation_failed_restored') from None

if __name__=='__main__':
    import sys
    install()
    try:activate(Path(sys.argv[1]))
    except Exception:raise SystemExit('Activation incomplete. Check operator rollback plan; no database mutation performed.')
