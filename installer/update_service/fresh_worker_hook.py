"""One-time worker v3 provisioning after the immutable v1.8.0 fresh wizard.

Arm on an EMPTY server only. Never re-runs a store installer on an existing
installation. Private keys/catalog publication are not part of this hook.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import core
from . import worker_upgrade
from .trust import Rejected

HOOK=Path('/etc/single-store-worker-bootstrap')
UNIT='single-store-worker-v3-bootstrap'
UNITS=Path('/etc/systemd/system')


def arm(source,sha):
    if os.geteuid()!=0:raise Rejected('operator_required')
    if core.STATE.exists() or any(p.exists() for p in (core.CONFIG,core.ROOT,core.DATA)):raise Rejected('existing_store_use_worker_upgrade')
    if any((UNITS/(UNIT+suffix)).exists() for suffix in ('.service','.timer')):raise Rejected('existing_bootstrap_unit_review')
    source=Path(source).resolve();worker_upgrade.inventory(source,sha)
    if os.name=='posix' and not re.fullmatch('/[A-Za-z0-9_./-]+',str(source)):raise Rejected('worker_source')
    HOOK.mkdir(mode=0o700,exist_ok=False)
    core.atomic_json(HOOK/'plan.json',{'source':str(source),'sha':sha,'phase':'waiting_for_fresh_wizard'})
    with (UNITS/(UNIT+'.service')).open('x') as f:f.write('[Unit]\nDescription=One-time verified worker v3 provisioning after fresh store wizard\nAfter=docker.service\n[Service]\nType=oneshot\nUser=root\nUMask=0077\nWorkingDirectory='+str(source/'installer')+'\nExecStart=/usr/bin/python3 -m update_service.fresh_worker_hook run\n')
    with (UNITS/(UNIT+'.timer')).open('x') as f:f.write('[Unit]\nDescription=Complete fresh store worker provisioning\n[Timer]\nOnBootSec=30\nOnUnitActiveSec=15\nUnit='+UNIT+'.service\n[Install]\nWantedBy=timers.target\n')
    core.run(['systemctl','daemon-reload']);core.run(['systemctl','enable','--now',UNIT+'.timer'])


def run():
    if os.geteuid()!=0:raise Rejected('operator_required')
    plan=core.read_json(HOOK/'plan.json')
    if plan['phase']=='complete':return
    if not core.STATE.exists() or not (core.CONFIG/'updater/activated.json').exists():return
    if not core.read_json(core.STATE).get('complete'):return
    journal=core.CONFIG/'updater/worker-upgrade.json'
    if journal.exists():
        receipt=core.read_json(journal)
        if receipt.get('sourceSha')!=plan['sha'] or receipt.get('phase')!='complete':
            raise Rejected('operator_reconciliation_required')
        expected={n:__import__('hashlib').sha256(v).hexdigest() for n,v in worker_upgrade.inventory(plan['source'],plan['sha']).items()}
        if worker_upgrade.files_digest(core.ROOT/'updater')!=expected:raise Rejected('worker_source_bytes')
        worker_upgrade.health()
    else:worker_upgrade.install(plan['source'],plan['sha'],True)
    plan['phase']='complete';core.atomic_json(HOOK/'plan.json',plan)
    core.run(['systemctl','disable','--now',UNIT+'.timer'])


def start_wizard(source,sha,app_archive):
    """New-server entry: immutable app source + separately pinned worker source."""
    if core.STATE.exists() or any(p.exists() for p in (core.CONFIG,core.ROOT,core.DATA)):
        raise Rejected('existing_store_use_worker_upgrade')
    from .policy_operator import TARGET_SHA,TARGET_DIGEST
    from promotions_transition import package
    manifest,files=package(app_archive,TARGET_DIGEST,TARGET_SHA,'1.8.0')
    source=Path(source).resolve();worker_upgrade.inventory(source,sha)
    # Arm only after all inputs are authenticated; does not touch store paths.
    arm(source,sha)
    app=HOOK/'app-v180'
    core.run(['git','-C',str(source),'worktree','add','--detach',str(app),TARGET_SHA])
    for name,data in files.items():
        if (app/name).is_symlink() or not (app/name).is_file() or (app/name).read_bytes()!=data:
            raise Rejected('app_source_artifact_mismatch')
    # A fresh wizard is expected here. Existing-store paths were refused above.
    subprocess.run(['bash',str(app/'install.sh')],check=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('arm');p.add_argument('--source',required=True);p.add_argument('--sha',required=True)
    p=sub.add_parser('start-wizard');p.add_argument('--source',required=True);p.add_argument('--sha',required=True);p.add_argument('--app-archive',required=True)
    sub.add_parser('run');args=parser.parse_args()
    if args.command=='arm':arm(args.source,args.sha)
    elif args.command=='start-wizard':start_wizard(args.source,args.sha,args.app_archive)
    else:run()
    print('Fresh worker provisioning checked; no store data reset or catalog publication.')
