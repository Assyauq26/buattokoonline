"""Automatic registration on a newly provisioned installation only.

The operator-authenticated installer checkout carries the public trust bundle;
no remote endpoint is allowed to replace it. Existing shops use bootstrap.py.
"""
import json
from pathlib import Path
import core
from .activate import activate
from .bootstrap import prepare
from .trust import Rejected

def install_new(state):
    if state.get('local_test'):return
    source=Path(state['installer_source']).resolve()
    roots=core.ROOT/'manager/updater-trust.json'
    unit=core.ROOT/'manager/single-store-updater.service'
    if not roots.is_file() or not unit.is_file():raise Rejected('updater_installation_files_missing')
    app=json.loads(core.run(['docker','inspect','single-store-app-1']))[0]['NetworkSettings']['Networks']
    proxy=json.loads(core.run(['docker','inspect','single-store-proxy-1']))[0]['NetworkSettings']['Networks']
    common=set(app)&set(proxy)
    if len(common)!=1:raise Rejected('proxy_network_review')
    address=app[next(iter(common))]['Gateway']
    prepare(source,roots,address,installed_copy=core.ROOT)
    activate(unit)
