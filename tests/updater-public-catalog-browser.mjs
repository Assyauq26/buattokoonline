/** Explicit disposable legacy pilot: real HTTPS catalog and real dashboard buttons. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,expect}=require('../app/node_modules/@playwright/test');
const origin='http://127.0.0.1:3198',caseId=process.env.UPDATER_LAB_CASE;
assert.equal(caseId,'a1800011');
const creds=JSON.parse(readFileSync(process.env.UPDATER_BROWSER_CREDENTIALS,'utf8').replace(/^\uFEFF/,''));
const out=resolve('promotion-evidence/updater-public-'+caseId);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],phases=new Set();
function record(stage,extra={}){writeFileSync(resolve(out,'progress.json'),JSON.stringify({stage,...extra},null,2));console.log(stage);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const login=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:creds.admin,password:creds.password}});assert.equal(login.status(),200);
 await context.addCookies((await context.cookies()).map(c=>({...c,secure:false})));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
 await page.goto(origin+'/admin');await expect(page.locator('body')).not.toContainText('Application error:');
 await page.goto(origin+'/admin/settings/updates');await expect(page.locator('#worker')).toHaveText('Updater v3');
 await page.getByRole('button',{name:'Cek pembaruan',exact:true}).click();
 await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toBeVisible({timeout:60000});
 await expect(page.locator('#installed')).toHaveText('1.7.4');await expect(page.locator('#latest')).toHaveText('1.8.0');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,'ready-'+width+'.png'),fullPage:true});}
 record('public-catalog-offer-visible');
 await page.getByRole('button',{name:'Update sekarang',exact:true}).click();record('updating');
 let finished;
 for(let i=0;i<400;i++){
  await pause(3000);
  try{
   const r=await context.request.get(origin+'/api/local-updater/session-status',{timeout:15000});if(r.status()!==200)continue;
   const s=await r.json(),job=s.jobs?.[0];if(job)phases.add(job.state);
   if(job?.state==='succeeded'){finished=s;break;}
   if(['failed','recovery_required','rolled_back'].includes(job?.state)){writeFileSync(resolve(out,'failure.json'),JSON.stringify({state:job.state,detail:job.detail,availability:s.availability},null,2));throw Error('Pilot job did not succeed');}
  }catch(e){if(e.message==='Pilot job did not succeed')throw e;}
 }
 assert(finished,'Actual cutover completed');assert.equal(finished.installedVersion,'1.8.0');
 await page.goto(origin+'/admin/settings/updates');await expect(page.getByRole('heading',{name:'Update berhasil',exact:true})).toBeVisible();await expect(page.locator('#installed')).toHaveText('1.8.0');
 await page.screenshot({path:resolve(out,'success.png'),fullPage:true});
 const smokes=[];
 for(const path of ['/','/login','/admin','/admin/products','/admin/marketing?tab=flash','/admin/marketing?tab=voucher','/account','/orders']){
  const r=await context.request.get(origin+path);assert.equal(r.status(),200,path);assert(!(await r.text()).includes('Application error:'));smokes.push(path);
 }
 const buyer=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:creds.customer,password:creds.password}});assert.equal(buyer.status(),200,'Existing customer login');
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'result.json'),JSON.stringify({ok:true,caseId,catalog:'https://buattokosendiri.web.id/api/platform/store-releases',catalogTransportPatched:false,from:'1.7.4',to:'1.8.0',phases:[...phases],smokes,existingSellerAndCustomerLogin:true,errors,productionShopAppMutations:false},null,2));record('complete');
}catch(e){record('failed',{error:e.name,message:e.message.slice(0,300)});process.exitCode=1;}finally{await browser.close();}
