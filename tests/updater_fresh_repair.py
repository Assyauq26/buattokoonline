"""Bounded repair of the first disposable fresh QA rehearsal, not a fleet tool.

The old immutable wizard omitted runtime SHA and its unit removed the mounted
socket directory. Future fresh launches prevent both. Repair only this named,
empty, user-designated QA installation through the same drain/fence primitives.
No SQL/ledger change, bootstrap rerun or database restore.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
import core
from update_service.state import State
from update_service.engine import Engine
from update_service.native_forward import NativeForward,FLAGS
from update_service.service_runtime import preserve
from update_service.policy_operator import TARGET_SHA,TARGET_DIGEST
from promotions_transition import package,runtime_paths

if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('Root required')
    setup=core.read_json(core.STATE);installed=core.read_json(core.CONFIG/'version.json')
    assert setup['name']=='Hubify QA Fresh' and setup['domain']=='gheverhan.store' and setup['complete'] and not setup['local_test']
    assert Path('/proc/sys/kernel/random/boot_id').read_text().strip()=='d147ea5d-4746-44e0-aee6-516a63c769c1'
    assert installed['source_sha']==TARGET_SHA and installed['version']=='1.8.0' and len(installed['migrations'])==30
    manifest,files=package(Path('/root/releases/store-v1.8.0.tar.gz'),TARGET_DIGEST,TARGET_SHA,'1.8.0')
    cfg=core.read_json(core.CONFIG/'updater/config.json');state=State(cfg['database'],cfg['installation'])
    assert not state.jobs()
    with open('/run/single-store-operation.lock','a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        assert core.sql('SELECT (SELECT count(*) FROM "Order")+(SELECT count(*) FROM "Product")+(SELECT count(*) FROM "JntShipmentRequest");')=='0'
        assert core.sql('SELECT count(*) FROM "User";')=='1'
        driver=NativeForward(Engine(state,cfg),{'id':'qa-fresh-runtime','release':json.dumps({'sha':TARGET_SHA,'digest':TARGET_DIGEST,'version':'1.8.0'})})
        names=sorted(runtime_paths(files));expected={n:hashlib.sha256(files[n]).hexdigest() for n in names}
        js="const f=require('fs'),c=require('crypto');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const o={};for(const p of JSON.parse(s))o[p]=c.createHash('sha256').update(f.readFileSync('/app/'+p.slice(4))).digest('hex');console.log(JSON.stringify(o))});"
        actual=json.loads(core.dc(['exec','-T','app','node','-e',js],input=json.dumps(names).encode()));assert actual==expected
        old=core.read_json(core.COMPOSE);env=old['services']['app'].setdefault('environment',{});assert env.get('STORE_BUILD_SHA') is None
        item=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0];image=item['Image']
        flags={k:driver.env().get(k) for k in FLAGS};ledger=driver.ledger_rows();before=driver.data_snapshot()
        policy=preserve(apply=True)
        j={'guards':driver.guards(),'proxy':cfg['approvedProxyHashes'],'timer':driver.active('single-store-maintenance.timer')}
        journal=Path('/root/fresh-runtime-repair.json');core.atomic_json(journal,{'phase':'drain','image':image,'ledger':ledger,'data':before})
        driver.drain(j);driver.fence(j)
        assert driver.data_snapshot()==before and driver.ledger_rows()==ledger
        env['STORE_BUILD_SHA']=TARGET_SHA
        core.atomic_json(journal,{'phase':'recreate-same-image','image':image,'ledger':ledger,'data':before})
        core.atomic_json(core.COMPOSE,old)
        core.dc(['up','-d','--no-deps','--no-build','--force-recreate','--wait','app'])
        core.healthy();new=json.loads(core.run(['docker','inspect',core.dc(['ps','-q','app'])]))[0]
        values=dict(x.split('=',1) for x in new['Config']['Env'] if '=' in x)
        assert new['Image']==image and values['STORE_BUILD_SHA']==TARGET_SHA
        assert driver.data_snapshot()==before and driver.ledger_rows()==ledger and {k:driver.env().get(k) for k in FLAGS}==flags
        driver.open_traffic(j);driver.resume_workers(j)
        report={'freshQaOnly':True,'runtimeFilesAuthenticated':len(names),'sameImageRetained':image,'runtimeShaBoundAfterProof':TARGET_SHA,
            'ledgerRowsUnchanged':len(ledger),'tableProjectionsUnchanged':len(before),'ordersBeforeAfter':0,'usersBeforeAfter':1,
            'jntFlagsUnchanged':True,'socketPolicyHash':policy['sha256'],'databaseRestore':False,'migrationExecuted':False,'bootstrapRepeated':False,'centralPlatformChanged':False}
        core.atomic_json(journal,{'phase':'complete',**report});print(json.dumps(report))
