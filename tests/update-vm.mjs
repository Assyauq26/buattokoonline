import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runRoot} from './vm-root.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url));const {expect}=require('@playwright/test');
function root(args,input){return runRoot(args,{input,timeout:900000});}
function version(){return JSON.parse(root(['cat','/etc/single-store/version.json'])).version;}
function fingerprint(sql){return sql(`SELECT json_build_object('brand',(SELECT published->'identity'->>'name' FROM "StoreAppearance"),'products',(SELECT count(*) FROM "Product"),'stock',(SELECT sum("onHand") FROM "Inventory"),'users',(SELECT md5(string_agg(id||email||"passwordHash",',' ORDER BY id)) FROM "User"));`);}
function media(){return root(['python3','-c',"import pathlib,hashlib,json; p=pathlib.Path('/var/lib/single-store/media'); print(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file()},sort_keys=True))"]);}
export async function verifyUpdates({context,base,email,password,pass,sql}){
  root(['python3','/tmp/single-store-clone/tests/release-fixtures.py']);
  const before=fingerprint(sql),files=media(),configuration=root(['sha256sum','/etc/single-store/runtime.env']).split(' ')[0];
  const initial=root(['cat','/tmp/single-store-clone/VERSION']).trim();
  const [major,minor,patch]=initial.split('.').map(Number);
  const compatible=`${major}.${minor}.${patch+1}`, failing=`${major}.${minor}.${patch+2}`;
  assert.equal(version(),initial);
  const update=(v)=>root(['--preserve-env=GITHUB_ACTIONS','bash','/opt/single-store/manager/update.sh','--apply','--fixture','/tmp/store-v'+v+'.json'],'UPDATE v'+v+'\n');
  // A mismatch must fail before downtime or backup, without accepting package content.
  root(['python3','-c',"import json,sys; d=json.load(open(sys.argv[1])); d['release']['digest']='0'*64; json.dump(d,open('/tmp/store-tampered.json','w'))",'/tmp/store-v'+compatible+'.json']);
  assert.throws(()=>root(['--preserve-env=GITHUB_ACTIONS','bash','/opt/single-store/manager/update.sh','--apply','--fixture','/tmp/store-tampered.json'],'UPDATE v'+compatible+'\n'));
  assert.equal(version(),initial);assert.equal(fingerprint(sql),before);
  update(compatible);assert.equal(version(),compatible);assert.equal(fingerprint(sql),before);assert.equal(media(),files);
  assert.equal(root(['sha256sum','/etc/single-store/runtime.env']).split(' ')[0],configuration);
  await expect.poll(async()=>{try{return(await context.request.get(base+'/api/v1/ready')).status();}catch{return 0;}},{timeout:60000}).toBe(200);
  assert.equal((await context.request.get(base+'/api/v1/admin/store-appearance')).status(),200);
  const journal=JSON.parse(root(['cat','/etc/single-store/update.json']));assert.equal(journal.status,'complete');
  const restored=JSON.parse(root(['bash','/opt/single-store/manager/restore.sh','--check',journal.backup]));
  assert.equal(restored.restored_to_scratch_database,true);assert.equal(restored.counts.products,1);assert.equal(restored.counts.users,1);assert(restored.media_count>=2);assert.equal(restored.configuration_runtime_sha256,configuration);
  pass('Release digest, compatible additive update, backup and actual scratch restore preserve account/brand/products/media/config');
  assert.throws(()=>update(failing));
  assert.equal(version(),compatible);assert.equal(fingerprint(sql),before);assert.equal(media(),files);
  const rolledBack=JSON.parse(root(['cat','/etc/single-store/update.json']));assert.equal(rolledBack.status,'code_rolled_back');
  assert.equal(sql('SELECT count(*) FROM "StoreFailureProbe";'),'0'); // Compatible schema remains; no down migration was claimed.
  await expect.poll(async()=>{try{return(await context.request.get(base+'/api/v1/ready')).status();}catch{return 0;}},{timeout:60000}).toBe(200);
  const login=await context.request.post(base+'/api/v1/auth/login',{headers:{Origin:base},data:{identifier:email,password}});assert.equal(login.status(),200);
  assert.equal((await context.request.get(base+'/api/v1/admin/store-appearance')).status(),200);
  pass('Failed disposable release restores previous container/code and login, retaining compatible schema and all seller data');
}
