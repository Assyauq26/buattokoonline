/** Offline worker UI verification. Never connects to a shop or starts an update. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,expect}=require(process.env.UPDATER_PLAYWRIGHT_MODULE||'../app/node_modules/@playwright/test');
const html=execFileSync(process.env.UPDATER_PYTHON||'python3',['-X','utf8','-c',"import sys;sys.path.insert(0,'installer');from update_service.status_page import page;sys.stdout.buffer.write(page()[0])"],{encoding:'utf8'});
const origin='https://updater-progress.example.invalid',out=resolve('output/updater-progress');mkdirSync(out,{recursive:true});
const now=Math.floor(Date.now()/1000),job={id:'isolated-ui-fixture',version:'1.8.1',created:now-420,updated:now-400,state:'preparing',detail:{downloaded:4886214,total:4886214}};
let status={installedVersion:'1.8.0',updaterVersion:3,checkedAt:now,availability:{state:'available',latest:{version:'1.8.1'}},catalogLatest:{version:'1.8.1'},release:{version:'1.8.1',notes:'Paket resmi'},jobs:[job]};
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),page=await context.newPage();const mutations=[],errors=[];
page.on('pageerror',e=>errors.push(e.name));
await context.route('**/*',async route=>{
 const r=route.request();if(r.method()!=='GET'){mutations.push(r.method());return route.fulfill({status:403,body:'Read only test'});}
 if(r.url()===origin+'/admin/settings/updates')return route.fulfill({contentType:'text/html',body:html});
 if(r.url()===origin+'/api/local-updater/session-status')return route.fulfill({json:status});
 return route.fulfill({status:404,body:''});
});
try{
 await page.goto(origin+'/admin/settings/updates');await expect(page.locator('#stage-caption')).toHaveText('Tahap 3 dari 8 · Menyiapkan aplikasi');
 assert.equal(await page.locator('#stage-progress').evaluate(p=>p.value),2);
 await expect(page.locator('#availability')).toContainText('Update sedang berlangsung');
 await expect(page.locator('#start')).toBeHidden();await expect(page.locator('#check')).toBeDisabled();
 await expect(page.locator('#stage-hint')).toContainText('beberapa menit');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,'preparing-'+width+'.png'),fullPage:true});}
 status={...status,jobs:[{...job,state:'downloading',detail:{downloaded:40,total:100}}]};await page.evaluate(s=>render(s),status);
 assert.equal(await page.locator('#download-progress').evaluate(p=>p.value),40);await expect(page.locator('#download')).toHaveText('Unduhan 40%');
 status={...status,jobs:[{...job,state:'migrating'}]};await page.evaluate(s=>render(s),status);assert.equal(await page.locator('#stage-progress').evaluate(p=>p.value),4);await expect(page.locator('#download-progress')).toBeHidden();
 status={...status,installedVersion:'1.8.1',release:null,availability:{state:'current'},jobs:[{...job,state:'succeeded',detail:{activeVersion:'1.8.1'}}]};await page.evaluate(s=>render(s),status);
 assert.equal(await page.locator('#stage-progress').evaluate(p=>p.value),8);await expect(page.locator('#stage-caption')).toHaveText('8 dari 8 tahap selesai');await expect(page.locator('#reload')).toBeVisible();
 await page.screenshot({path:resolve(out,'succeeded.png'),fullPage:true});
 status={...status,jobs:[{...job,state:'recovery_required',detail:{error:'migration_history'}}]};await page.evaluate(s=>render(s),status);
 await expect(page.locator('#stage-progress')).toBeHidden();await expect(page.locator('#availability')).toHaveText('Update memerlukan bantuan operator.');await expect(page.locator('#start')).toBeHidden();
 await page.reload();await expect(page.locator('#phase')).toHaveText('Perlu bantuan operator');
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 writeFileSync(resolve(out,'result.json'),JSON.stringify({ok:true,fixtureOnly:true,widths:[390,1440],stageCountNotTimePercentage:true,realDownloadRatio:true,busyStateConsistent:true,successEightOfEight:true,recoveryDoesNotClaimCompletion:true,reopenPreservesState:true,mutations,errors},null,2));console.log('Worker progress UI browser PASS');
}finally{await browser.close();}
