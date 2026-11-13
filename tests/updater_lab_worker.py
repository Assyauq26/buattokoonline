"""Disposable systemd launcher: imports the ACTUALLY installed v2/v3 worker.

Only path/network/catalog test transports are injected. Never a production unit.
This file lives outside the atomically exchanged worker directory.
"""
import argparse
import contextlib
import fcntl
import io
import json
import os
from pathlib import Path
import re
import signal
import sys
import threading
from unittest.mock import patch

parser=argparse.ArgumentParser();parser.add_argument('--case',required=True);args=parser.parse_args()
if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{8}',args.case):raise SystemExit('Disposable root case required')
root=Path('/opt/updater-lab')/args.case
sys.path.insert(0,str(root/'updater'))
import core,updater
from update_service import VERSION
from update_service.runtime import install
from update_service.server import Controller,Handler,UnixServer,StatusServer
install()


@contextlib.contextmanager
def legacy():
    config=root/'etc';cfg=json.loads((config/'updater/config.json').read_text())
    class Transport:
        def open(self,*a,**k):return io.BytesIO((root/'catalog.json').read_bytes())
    with contextlib.ExitStack() as stack:
        for name,value in [('core.ROOT',root),('core.CONFIG',config),('core.DATA',root/'data'),('core.COMPOSE',root/'compose.json'),
            ('core.STATE',config/'setup.json'),('updater.BACKUPS',root/'backups'),('update_service.server.build_opener',lambda *a:Transport())]:stack.enter_context(patch(name,value))
        yield root,cfg


if VERSION>=3:
    sys.path.insert(0,str(Path(__file__).parent))
    from updater_linux_lab import context
    scope=context(args.case)
else:scope=legacy()

with scope as (_,cfg),open(root/'worker.lock','a+') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    controller=Controller(cfg)
    for name,readonly in [('control.sock',False),('status.sock',True)]:
        path=root/'run'/name;path.unlink(missing_ok=True)
        server=UnixServer(str(path),Handler);server.controller=controller;server.readonly=readonly
        path.chmod(0o666 if readonly else 0o660);os.chown(path,0,1000)
        threading.Thread(target=server.serve_forever,daemon=True).start()
    server=StatusServer((cfg['statusAddress'],cfg['statusPort']),Handler);server.controller=controller;server.readonly=True
    threading.Thread(target=server.serve_forever,daemon=True).start()
    threading.Thread(target=controller.worker,daemon=True).start()
    core.atomic_json(root/'worker-ready.json',{'version':VERSION,'pid':os.getpid(),'case':args.case})
    while True:signal.pause()
