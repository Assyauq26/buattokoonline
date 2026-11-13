"""Disposable v1.7.3 -> v1.7.4 -> v1.8.0 integration rehearsal.

Runs the real controller and cutover code against separate Docker/DB fixtures.
Optionally reuses separately inventoried images already built from these exact
published artifacts; receipts explicitly distinguish this from a fresh build.
"""
import argparse
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import uuid
from unittest.mock import patch
import updater_linux_lab as lab
from promotions_transition import package, runtime_paths, BASE_ARCHIVE, BASE_RELEASE_SOURCE
from update_service.server import Controller
import core

OLD_SHA='b8b33ebecec3f1c9798b7148f0f407da142afb46'
OLD_DIGEST='78ad297baa8f76225ab8ef649fc05a72bd45bd6a88ede9ffd18420bf4e121cd0'


def signed_catalog(root,cat):
    raw=root/'multistep-payload';sig=root/'multistep-signature'
    raw.write_text(json.dumps(cat,separators=(',',':')))
    lab.command(['openssl','pkeyutl','-sign','-inkey',root/'test-key.pem','-rawin','-in',raw,'-out',sig])
    (root/'catalog.json').write_text(json.dumps({'keyId':'lab-test','payload':base64.b64encode(raw.read_bytes()).decode(),'signature':base64.b64encode(sig.read_bytes()).decode()}))


def prepare(case):
    old,files=package('/tmp/updater-baseline-v173.tar.gz',OLD_DIGEST,OLD_SHA,'1.7.3')
    target,_=package('/tmp/updater-baseline-v174.tar.gz',BASE_ARCHIVE,BASE_RELEASE_SOURCE,'1.7.4')
    if old['migrations']!=target['migrations']:raise RuntimeError('Historical ledgers differ; fixture cannot be rebased')
    lab.prepare(case)
    root=lab.BASE/case;cfg=root/'etc';compose=json.loads((root/'compose.json').read_text())
    dc=['docker','compose','-f',root/'compose.json']
    lab.command(dc+['stop','app'])
    baseline=root/'baseline173';baseline.mkdir()
    for name,data in files.items():
        path=baseline/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    (baseline/'release.json').write_text(json.dumps(old))
    for name in ('app','tools'):
        compose['services'][name]['image']='single-store-'+name+':update-165c0275b5a99fe342dce97eb860d47d'
        compose['services'][name]['build']['context']=str(baseline/'app')
    compose['services']['app']['environment'].update(STORE_INSTALLED_VERSION='1.7.3',STORE_BUILD_SHA=OLD_SHA)
    (root/'compose.json').write_text(json.dumps(compose))
    (cfg/'version.json').write_text(json.dumps({'version':'1.7.3','source_sha':OLD_SHA,'db_contract':1,'migrations':old['migrations']}))
    (cfg/'updater/baseline.json').write_text(json.dumps({'root':str(baseline),'files':old['files']}))
    # Explicit enabled guard fixture; never calls a carrier API. Checkout stays manual.
    env=dict(x.split('=',1) for x in (cfg/'runtime.env').read_text().splitlines() if '=' in x)
    env.update(PAYMENT_PROVIDER='manual',REGION_DATA_MODE='snapshot',JNT_PRODUCTION_API_APPROVED='1',JNT_PRODUCTION_ORDER_APPROVED='1',JNT_ENABLE_ORDER_CREATE='1')
    (cfg/'runtime.env').write_text('\n'.join(k+'='+v for k,v in env.items())+'\n')
    envelope=json.loads((root/'catalog.json').read_text());cat=json.loads(base64.b64decode(envelope['payload']))
    cat['sequence']=2
    cat['releases'].append({'version':'1.7.4','sha':BASE_RELEASE_SOURCE,'digest':BASE_ARCHIVE,'size':Path('/tmp/updater-baseline-v174.tar.gz').stat().st_size,
        'url':'https://github.com/Assyauq26/buattokoonline/releases/download/v1.7.4/store-v1.7.4.tar.gz','channel':'stable','minimumUpdater':2,
        'minimumInstalledVersion':'1.7.3','maximumInstalledVersion':'1.7.3','dbContract':1,'rollbackCompatible':True,'notes':'Verified predecessor, then recheck 1.8.0'})
    signed_catalog(root,cat);lab.command(dc+['up','-d','--no-deps','--no-build','--wait','app'])
    print(json.dumps({'prepared':case,'version':'1.7.3','ledgerUnmodified':29,'source':OLD_SHA}))


def fixtures(case):
    root=lab.BASE/case
    # Synthetic checkout data only in the owned disposable clone, before update.
    js=r"""const P=require('@prisma/client').PrismaClient,p=new P(),fs=require('fs'),z=require('zlib');let raw='';process.stdin.on('data',v=>raw+=v);process.stdin.on('end',async()=>{try{
    const c=JSON.parse(raw),user=await p.user.findUniqueOrThrow({where:{email:c.customer},include:{customer:true}});
    const x=JSON.parse(z.gunzipSync(fs.readFileSync('/app/src/modules/regions/data/snapshot.json.gz')));
    const a=x.provinces.data[0],b=x['regencies/'+a.code].data[0],d=x['districts/'+b.code].data[0],v=x['villages/'+d.code].data[0];
    await p.customerAddress.create({data:{customerId:user.customer.id,recipientName:'Isolated checkout buyer',phone:'081234567890',line:'Isolated updater test address',province:a.name,city:b.name,district:d.name,village:v.name,provinceCode:a.code,cityCode:b.code,districtCode:d.code,villageCode:v.code,postalCode:v.postalCode||'',isDefault:true,regionSource:'emsifa-v2',regionUpdatedAt:x.provinces.updatedAt}});
    const product=await p.product.create({data:{name:'Isolated updater checkout',slug:'isolated-updater-'+c.case,basePrice:10000,weightGrams:100,status:'PUBLISHED',variants:{create:{sku:'ISOLATED-'+c.case,price:10000,inventory:{create:{onHand:100}}}}},include:{variants:true}});
    await p.bankAccount.create({data:{bankName:'Isolated manual bank',accountNumber:'0000000000',accountHolder:'Isolated test only',displayName:'Isolated manual test',isActive:true}});
    await p.shippingSettings.upsert({where:{id:1},create:{id:1,manualFlat:7000},update:{manualFlat:7000,activeJntId:null}});
    console.log(JSON.stringify({variantId:product.variants[0].id,productId:product.id,customerId:user.id}));await p.$disconnect();
    }catch{process.exit(1)}});"""
    credentials=json.loads((root/'browser-creds.json').read_text());credentials['case']=case
    result=lab.command(['docker','compose','-f',root/'compose.json','run','--rm','-T','--no-deps','tools','node','-e',js],json.dumps(credentials).encode())
    (root/'checkout-fixture.json').write_text(json.dumps(json.loads(result)))
    print('Synthetic isolated checkout fixture created; no real provider call.')


@contextlib.contextmanager
def reuse_images(root):
    path=root/'reuse-images.json'
    if not path.exists():yield;return
    images=json.loads(path.read_text())
    def build(engine,source,tag,target):
        if (source/'release.json').exists():manifest=json.loads((source/'release.json').read_text())
        else:
            with tarfile.open(source.parent/'release.tar.gz') as archive:manifest=json.load(archive.extractfile('release.json'))
        # The production extractor verified the archive; independently match all
        # extracted source bytes again before reusing an already-built image.
        for name,digest in manifest['files'].items():
            if hashlib.sha256((source/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('Extracted source mismatch')
        image=images[manifest['source_sha']][target]
        paths={p:h for p,h in manifest['files'].items() if p in runtime_paths(manifest['files'])}
        js="""const fs=require('fs'),c=require('crypto');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const out={};for(const p of JSON.parse(s)){try{out[p]=c.createHash('sha256').update(fs.readFileSync('/app/'+p.slice(4))).digest('hex')}catch{out[p]=null}}console.log(JSON.stringify(out))});"""
        actual=json.loads(lab.command(['docker','run','--rm','-i','--network','none',image,'node','-e',js],json.dumps(list(paths)).encode()))
        if actual!=paths:raise RuntimeError('Cached image source mismatch')
        lab.command(['docker','tag',image,tag])
        with (root/'reused-image-receipts.jsonl').open('a') as out:out.write(json.dumps({'source':manifest['source_sha'],'target':target,'image':image,'filesVerified':len(paths),'freshBuild':False})+'\n')
    with patch('update_service.engine.Engine.build',build):yield


def run(case):
    with lab.context(case) as (root,cfg),reuse_images(root):
        controller=Controller(cfg)
        admin=json.loads(core.sql('''SELECT row_to_json(x) FROM (SELECT u.id,u."sessionVersion" FROM "User" u JOIN "UserRole" ur ON ur."userId"=u.id JOIN "Role" r ON r.id=ur."roleId" WHERE r.name='Admin' AND u.email LIKE 'updater-admin-%@example.invalid' LIMIT 1) x;'''))
        actor={'installation':cfg['installation'],'actor':admin['id'],'sessionVersion':admin['sessionVersion'],'sessionHash':'f'*64,'sessionExpires':int(time.time())+86400}
        for version in ('1.7.4','1.8.0'):
            from update_service.trust import version as semver
            if semver(core.read_json(core.CONFIG/'version.json')['version'])>=semver(version):continue
            remaining=31-(time.time()-controller.last_check)
            if remaining>0:time.sleep(remaining)
            status=controller.command({**actor,'action':'check'})
            if not status['release'] or status['release']['version']!=version:raise RuntimeError('Unexpected planned next version: '+str(status['availability']))
            controller.command({**actor,'action':'start','sha':status['release']['sha'],'requestKey':str(uuid.uuid4())})
            job=controller.state.jobs()[0];controller.engine.process(job)
            result=controller.state.jobs()[0]
            if result['state']!='succeeded':raise RuntimeError('Cutover did not succeed: '+result['state'])
            with (root/'multistep-results.jsonl').open('a') as out:out.write(json.dumps({'version':version,'state':result['state'],'ledger':len(controller.engine.ledger()),'directController':True})+'\n')
            print(json.dumps({'version':version,'state':result['state']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','fixtures','run']);p.add_argument('--case',required=True);a=p.parse_args()
    if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{8}',a.case):raise SystemExit('Explicit root lab case required')
    {'prepare':prepare,'fixtures':fixtures,'run':run}[a.action](a.case)
