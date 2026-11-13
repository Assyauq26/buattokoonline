/** Explicit loopback lab only; actual worker/API/UI. No external browser requests. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,expect}=require('../app/node_modules/@playwright/test');
const origin='http://127.0.0.1:3198',caseId=process.env.UPDATER_LAB_CASE;
assert(/^[a-f0-9]{8}$/.test(caseId||''),'Explicit disposable case required');
const credentials=JSON.parse(readFileSync(process.env.UPDATER_BROWSER_CREDENTIALS,'utf8').replace(/^\uFEFF/,''));
const out=resolve('promotion-evidence/updater-live-'+caseId);mkdirSync(out,{recursive:true});
const phases=new Set(),errors=[],blocked=[];const receipts=[];
function record(stage,extra={}){writeFileSync(resolve(out,'progress.json'),JSON.stringify({stage,caseId,...extra},null,2));console.log(stage);}
function remote(code){return execFileSync('ssh',['-T','gheverhan-updater-test','sudo -n python3 -'],{input:code,encoding:'utf8',timeout:20000,windowsHide:true});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();blocked.push(new URL(url).origin);return route.abort();});
let page;
function attach(p){p.on('pageerror',e=>errors.push(e.message));p.on('response',async r=>{if(r.url().endsWith('/api/local-updater/session-status')&&r.status()===200){try{const d=await r.json();if(d.jobs?.[0])phases.add(d.jobs[0].state);}catch{}}});}
async function status(){const r=await context.request.get(origin+'/api/local-updater/session-status',{timeout:20000});assert.equal(r.status(),200);return r.json();}
try{
 const login=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:credentials.admin,password:credentials.password}});
 assert.equal(login.status(),200,'Synthetic clone admin login');
 // Test loopback HTTP only. Production app cookie remains Secure/HttpOnly.
 await context.addCookies((await context.cookies()).map(c=>({...c,secure:false})));
 // Private resumable browser state stays outside the repository/evidence.
 if(process.env.UPDATER_BROWSER_STATE)await context.storageState({path:process.env.UPDATER_BROWSER_STATE});
 const unauthorized=await browser.newContext();const denied=await unauthorized.request.get(origin+'/api/local-updater/session-status');assert.equal(denied.status(),401);await unauthorized.close();
 page=await context.newPage();attach(page);await page.goto(origin+'/admin/settings/updates');
 await expect(page.locator('#worker')).toHaveText('Updater v3');
 await page.getByRole('button',{name:'Cek pembaruan',exact:true}).click();
 await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toBeVisible({timeout:60000});
 await expect(page.locator('#installed')).toHaveText('1.7.4');await expect(page.locator('#latest')).toHaveText('1.8.0');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:resolve(out,'ready-'+width+'.png'),fullPage:true});}
 receipts.push('Real login; cookie-protected independent UI; actual preflight eligibility; 390/1440 no horizontal overflow');
 const beforeBoot=remote("from pathlib import Path\nprint(Path('/proc/sys/kernel/random/boot_id').read_text().strip())\n").trim();
 remote("import json\nfrom pathlib import Path\nr=Path('/opt/updater-lab/"+caseId+"')\n(r/'fault.json').write_text(json.dumps({'phase':'migration_done','action':'pause'}))\n");
 await page.getByRole('button',{name:'Update sekarang',exact:true}).click();record('updating');
 let checkpoint=false;
 for(let i=0;i<600;i++){await sleep(3000);let d;try{d=await status();}catch{continue;}if(d.jobs?.[0])phases.add(d.jobs[0].state);
  const check=remote("from pathlib import Path\np=Path('/opt/updater-lab/"+caseId+"/fault-triggered.json')\nprint(p.read_text() if p.exists() else '{}')\n");
  if(JSON.parse(check).phase==='migration_done'){checkpoint=true;break;}
  if(['failed','recovery_required','rolled_back'].includes(d.jobs?.[0]?.state))throw Error('Unexpected state before reboot: '+d.jobs[0].state);
 }
 assert(checkpoint,'Native SQL commit checkpoint reached');await page.screenshot({path:resolve(out,'migration-before-reboot.png'),fullPage:true});
 record('ready-for-reboot',{beforeBoot});
 // Operator/test orchestration reboots the explicitly authorized test VM and
 // reconnects the SSH tunnel. This browser stays open to observe the outage.
 let recovered;
 for(let i=0;i<240;i++){await sleep(3000);try{const d=await status();if(d.jobs?.[0]?.state==='recovery_required'){recovered=d;break;}}catch{}}
 assert(recovered,'Worker recovered durable job state after actual VM reboot');
 const afterBoot=remote("from pathlib import Path\nprint(Path('/proc/sys/kernel/random/boot_id').read_text().strip())\n").trim();assert.notEqual(afterBoot,beforeBoot,'Actual kernel boot id changed');
 await page.close();page=await context.newPage();attach(page);await page.goto(origin+'/admin/settings/updates');
 await expect(page.getByRole('heading',{name:'Perlu bantuan operator',exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toBeHidden();
 await page.screenshot({path:resolve(out,'reopened-during-recovery.png'),fullPage:true});
 receipts.push('Actual VM reboot; durable recovery_required; reopen UI while app remains fenced; no new update start');
 record('recovery-visible-after-reopen',{beforeBoot,afterBoot});
 let finished;
 for(let i=0;i<240;i++){await sleep(3000);try{const d=await status();if(d.jobs?.[0]?.state==='succeeded'){finished=d;break;}}catch{}}
 assert(finished,'Operator forward recovery completed');assert.equal(finished.installedVersion,'1.8.0');
 await expect(page.getByRole('heading',{name:'Update berhasil',exact:true})).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:'Cek pembaruan',exact:true}).click();await expect(page.locator('#installed')).toHaveText('1.8.0');
 await page.screenshot({path:resolve(out,'success.png'),fullPage:true});
 for(const path of ['/','/login','/admin/products','/admin/marketing?tab=flash','/admin/marketing?tab=voucher','/account','/orders']){
  const r=await context.request.get(origin+path);assert.equal(r.status(),200,'Post-upgrade '+path);assert(!(await r.text()).includes('Application error:'));receipts.push('GET '+path+' 200');
 }
 assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(blocked,[],'No external browser requests');
 writeFileSync(resolve(out,'result.json'),JSON.stringify({ok:true,caseId,phases:[...phases],receipts,beforeBoot,afterBoot,errors,blocked,liveProductionTouched:false,catalog:'signed disposable test key'},null,2));record('complete');
}catch(error){record('failed',{error:error.name,reason:'Browser assertion or transport failure; inspect locally without persisting request headers.'});console.error(error.name);process.exitCode=1;}finally{await browser.close();}
