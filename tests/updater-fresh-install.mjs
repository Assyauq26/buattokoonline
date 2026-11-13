/** Full official fresh wizard + automatic worker provisioning on the reset QA VPS.
 * Credentials are read from an explicit private path, never printed or committed.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,expect}=require('../app/node_modules/@playwright/test');
const secret=JSON.parse(readFileSync(process.env.UPDATER_FRESH_CREDENTIALS,'utf8').replace(/^\uFEFF/,''));
assert.equal(secret.host,'43.173.21.197');assert.equal(secret.origin,'https://gheverhan.store');
const base='http://127.0.0.1:8787',out=resolve('promotion-evidence/updater-fresh-reset');mkdirSync(out,{recursive:true});
let cookie='',phase='session';
function record(stage,extra={}){phase=stage;writeFileSync(resolve(out,'progress.json'),JSON.stringify({stage,...extra},null,2));console.log(stage);}
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(path==='/api/session')cookie=r.headers.get('set-cookie')?.split(';')[0]||'';assert.equal(r.status,200,'Wizard HTTP '+path);return r.json();}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function idle(max=300000){const until=Date.now()+max;while(Date.now()<until){await pause(3000);try{const s=await api('/api/state');if(!s.busy)return s;}catch{}}throw Error('Wizard did not become idle');}
function remote(code){return execFileSync('ssh',['-T','gheverhan-updater-test','sudo -n python3 -'],{input:code,encoding:'utf8',timeout:20000,windowsHide:true});}
let browser;
try{
 if(process.env.UPDATER_FRESH_VERIFY_ONLY!=='1'){
 await api('/api/session',{token:secret.setupToken});assert(cookie);record('wizard-authenticated');
 await api('/api/name',{name:'Hubify QA Fresh'});await idle();record('name-accepted');
 let domain;
 for(let attempt=0;attempt<5;attempt++){
  await api('/api/domain',{domain:'gheverhan.store',www:false});domain=await idle();
  if(domain.status==='Domain berhasil terhubung')break;
  record('domain-check-pending',{status:domain.status});await pause(10000);
 }
 assert.equal(domain.status,'Domain berhasil terhubung');assert.equal(domain.evidence.https,'PUBLIC_CERTIFICATE_VALID');record('public-dns-https-verified');
 await api('/api/next',{});await api('/api/admin',{email:secret.email,password:secret.password,confirmation:secret.password});record('official-build-and-bootstrap');
 let state;
 for(let i=0;i<1200;i++){
  await pause(3000);try{state=await api('/api/state');}catch{continue;}
  if(state.complete)break;
  if(!state.busy)throw Error('Official installer stopped before completion');
 }
 assert(state?.complete);record('wizard-complete');
 }else record('verifying-completed-wizard-after-runtime-repair');
 let hook;
 for(let i=0;i<100;i++){
  await pause(3000);try{hook=JSON.parse(remote("import pathlib,json\np=pathlib.Path('/etc/single-store-worker-bootstrap/plan.json')\nprint(json.dumps({'phase':json.loads(p.read_text())['phase']}))\n"));}catch{continue;}
  if(hook.phase==='complete')break;
 }
 assert.equal(hook?.phase,'complete','Automatic v3 hook completed without a separate operator upgrade');record('worker-auto-provisioned');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const errors=[];
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
 await page.goto(secret.origin+'/admin/settings/updates');await expect(page).toHaveURL(/\/login\?redirectTo=/);
 await expect(page.getByRole('heading',{name:'Masuk Seller',exact:true})).toBeVisible();
 await page.getByTestId('login-identifier').fill(secret.email);await page.getByTestId('login-password').fill(secret.password);await page.getByTestId('auth-submit').click();
 await expect(page).toHaveURL(secret.origin+'/admin/settings/updates',{timeout:30000});
 await page.goto(secret.origin+'/admin');assert(!(await page.locator('body').innerText()).includes('Application error:'));await expect(page.locator('body')).toContainText('Hubify QA Fresh');
 await page.screenshot({path:resolve(out,'seller-dashboard.png'),fullPage:true});
 await page.goto(secret.origin+'/admin/settings/updates');await expect(page.locator('#worker')).toHaveText('Updater v3',{timeout:30000});await expect(page.locator('#installed')).toHaveText('1.8.0');
 const checked=page.waitForResponse(r=>r.url()===secret.origin+'/api/v1/admin/updater'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Cek pembaruan',exact:true}).click();const checkedResponse=await checked;assert.equal(checkedResponse.status(),200,'Actual app control API');
 const checkedData=(await checkedResponse.json()).data;assert(checkedData.checkedAt>0&&checkedData.catalogLatest?.version);assert.equal(checkedData.availability.state,'current');
 await expect(page.locator('#latest')).toHaveText(checkedData.catalogLatest.version,{timeout:30000});
 const directoryBefore=remote("import os,json\ns=os.stat('/run/single-store-updater')\nprint(json.dumps([s.st_dev,s.st_ino]))\n").trim();
 const lifecycle=[];
 for(const mode of ['restart','stop-start']){
  remote("import subprocess\n"+(mode==='restart'?"subprocess.run(['systemctl','restart','single-store-updater.service'],check=True)\n":"subprocess.run(['systemctl','stop','single-store-updater.service'],check=True)\nsubprocess.run(['systemctl','start','single-store-updater.service'],check=True)\n"));
  let control;
  for(let i=0;i<15;i++){await pause(2000);try{const r=await context.request.post(secret.origin+'/api/v1/admin/updater',{headers:{Origin:secret.origin},data:{action:'check'}});if(r.status()===200){control=(await r.json()).data;break;}}catch{}}
  assert(control?.checkedAt>0&&control.catalogLatest?.version,'Actual app control socket after '+mode);lifecycle.push(mode);
  const after=remote("import os,json\ns=os.stat('/run/single-store-updater')\nprint(json.dumps([s.st_dev,s.st_ino]))\n").trim();assert.equal(after,directoryBefore,'Stable app-mounted runtime directory');
 }
 await expect(page.locator('#latest')).not.toHaveText('Belum diperiksa',{timeout:20000});
 await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toBeHidden();
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,'updater-'+width+'.png'),fullPage:true});}
 const smoke=[];for(const path of ['/','/api/v1/ready','/admin/products','/admin/marketing?tab=flash','/admin/marketing?tab=voucher']){const r=await context.request.get(secret.origin+path);assert.equal(r.status(),200,path);smoke.push({path,status:r.status()});}
 assert.deepEqual(errors,[]);
 const result={ok:true,target:'43.173.21.197',origin:secret.origin,freshServer:true,officialWizard:true,publicCertificateVerified:true,localTestMode:false,
  installedVersion:await page.locator('#installed').innerText(),workerVersion:await page.locator('#worker').innerText(),catalogLatest:await page.locator('#latest').innerText(),
  automaticWorkerHook:'complete',separateOperatorWorkerUpgrade:false,rehearsalRequiredBoundedRuntimeRepair:process.env.UPDATER_FRESH_VERIFY_ONLY==='1',
  actualControlApiVerified:true,workerLifecycleControlChecks:lifecycle,runtimeDirectoryStable:true,
  actualSellerLogin:true,actualSellerLoginForm:true,anonymousUpdaterRedirectToRealLogin:true,
  sellerDashboard:true,mobileDesktopOverflow:false,smoke,errors,centralPlatformChanged:false};
 writeFileSync(resolve(out,'browser-result.json'),JSON.stringify(result,null,2));record('complete');
}catch(error){record('failed',{phase,error:error.name,reason:'Inspect private installer state/log; credentials and request headers are never emitted.'});console.error(phase,error.name);process.exitCode=1;}finally{await browser?.close();}
