/** Resume a lab browser assertion after an actual transport outage/reboot. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,expect}=require('../app/node_modules/@playwright/test');
const id=process.env.UPDATER_LAB_CASE;assert(/^[a-f0-9]{8}$/.test(id||''));
const origin='http://127.0.0.1:3198',out=resolve('promotion-evidence/updater-live-'+id);
mkdirSync(out,{recursive:true});
const storageState=JSON.parse(readFileSync(process.env.UPDATER_BROWSER_STATE,'utf8').replace(/^\uFEFF/,''));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({storageState,viewport:{width:390,height:844}});
const errors=[],blocked=[];
await context.route('**/*',r=>{if(r.request().url().startsWith(origin+'/'))return r.continue();blocked.push(new URL(r.request().url()).origin);return r.abort();});
const stage=s=>{writeFileSync(resolve(out,'recovery-progress.json'),JSON.stringify({caseId:id,stage:s}));console.log(s);};
try{
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
 await page.goto(origin+'/admin/settings/updates');
 await expect(page.getByRole('heading',{name:'Perlu bantuan operator',exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toBeHidden();
 await page.screenshot({path:resolve(out,'reopened-during-recovery.png'),fullPage:true});
 stage('recovery-visible-after-reopen');
 let final;
 for(let i=0;i<300;i++){
  await new Promise(r=>setTimeout(r,3000));
  try{const response=await context.request.get(origin+'/api/local-updater/session-status',{timeout:20000});if(!response.ok())continue;const d=await response.json();if(d.jobs?.[0]?.state==='succeeded'){final=d;break;}}catch{}
 }
 assert(final,'Official forward recovery completed');assert.equal(final.installedVersion,'1.8.0');
 await expect(page.getByRole('heading',{name:'Update berhasil',exact:true})).toBeVisible({timeout:30000});
 await page.screenshot({path:resolve(out,'success.png'),fullPage:true});
 const smoke=[];
 for(const path of ['/','/login','/admin/products','/admin/marketing?tab=flash','/admin/marketing?tab=voucher','/account','/orders']){
  const r=await context.request.get(origin+path,{timeout:30000});assert.equal(r.status(),200,path);assert(!(await r.text()).includes('Application error:'));smoke.push({path,status:r.status()});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 writeFileSync(resolve(out,'recovery-result.json'),JSON.stringify({ok:true,caseId:id,version:final.installedVersion,jobState:final.jobs[0].state,reopenWhileFenced:true,smoke,errors,blocked},null,2));stage('complete');
}catch(error){stage('failed');console.error(error.name);process.exitCode=1;}finally{await browser.close();}
