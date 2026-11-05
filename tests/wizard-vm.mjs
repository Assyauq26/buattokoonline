import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {runRoot} from './vm-root.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const setup='http://127.0.0.1:8787';
const root=(args)=>runRoot(args,{timeout:240000});
const state=()=>JSON.parse(root(['cat','/etc/single-store/setup.json']));
export async function installWizard({brand,email,password,pass}){
  // Capture the root-only setup link rather than emitting its authorization token into CI logs.
  root(['bash','/tmp/single-store-clone/install.sh','--local-test']);
  const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1100,height:900}});const page=await context.newPage();
  const headers={Origin:setup};
  try{
    await expect.poll(async()=>{try{return(await context.request.get(setup+'/api/state')).status();}catch{return 0;}},{timeout:30000}).toBe(401);
    assert.equal((await context.request.post(setup+'/api/admin',{headers,data:{email,password,confirmation:password}})).status(),401);
    const unauthorized=await context.request.post(setup+'/api/session',{headers:{Origin:'https://attacker.example'},data:{token:'invalid'}});assert.equal(unauthorized.status(),403);
    async function authorize(){
      const token=root(['cat','/etc/single-store/setup-token']).trim();
      await expect.poll(async()=>{try{return(await context.request.post(setup+'/api/session',{headers,data:{token}})).status();}catch{return 0;}},{timeout:30000}).toBe(200);
      await page.goto(setup+'/');
    }
    await authorize();await expect(page.locator('#step1')).toBeVisible();
    await page.screenshot({path:'test-results/wizard-1-name.png',fullPage:true});
    await page.getByLabel('Nama Toko / Brand').fill(brand);await page.getByRole('button',{name:'Lanjutkan',exact:true}).click();
    await expect(page.locator('#step2')).toBeVisible();
    assert.equal((await context.request.post(setup+'/api/admin',{headers,data:{email,password,confirmation:password}})).status(),422);
    assert.equal(state().bootstrap_started,undefined);
    assert.equal((await context.request.post(setup+'/api/next',{headers,data:{}})).status(),422);
    assert.equal((await context.request.post(setup+'/api/domain',{headers,data:{domain:'wrong.example'}})).status(),422);
    pass('Wizard authorization/origin checks and admin gate before DNS/HTTPS');
    // Resume at the DNS stage with the original brand and one-time authorization.
    root(['systemctl','restart','single-store-setup.service']);await authorize();
    await expect(page.locator('#step2')).toBeVisible();assert.equal(state().name,brand);
    await page.locator('#domain').fill('localhost');await page.locator('#check-domain').click();
    await expect(page.locator('#domain-status')).toContainText('Domain berhasil terhubung',{timeout:120000});
    assert.equal(state().evidence.mode,'LOCAL_TEST');assert.equal(state().evidence.https,'LOCAL_CA_VALID');
    await page.screenshot({path:'test-results/wizard-2-domain.png',fullPage:true});
    await page.locator('#domain-next').click();await expect(page.locator('#step3')).toBeVisible();
    async function enterAdmin(){
      await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('#confirmation').fill(password);
    }
    await enterAdmin();await page.locator('[data-target="password"]').click();await expect(page.locator('#password')).toHaveAttribute('type','text');await page.locator('[data-target="password"]').click();
    await page.screenshot({path:'test-results/wizard-3-admin.png',fullPage:true});
    await page.locator('#create-store').click();
    await expect.poll(()=>!!state().bootstrap_started,{timeout:120000}).toBe(true);
    await expect.poll(()=>state().progress?.phases.find(p=>p.id==='build').status,{timeout:30000}).toBe('running');
    await expect(page.locator('[data-phase="build"]')).toHaveAttribute('data-status','running',{timeout:10000});
    const projected=(await (await context.request.get(setup+'/api/state')).json());
    assert.equal(projected.progress.completed,2);assert.equal(projected.progress.total,9);
    for(const secret of [password,root(['cat','/etc/single-store/setup-token']).trim(),state().setup_hash,state().proof])assert(!JSON.stringify(projected).includes(secret));
    await page.screenshot({path:'test-results/wizard-progress-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await expect(page.locator('#installation-progress')).toBeVisible();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'test-results/wizard-progress-mobile.png',fullPage:true});
    await page.reload();await expect(page.locator('[data-phase="build"]')).toHaveAttribute('data-status','running',{timeout:10000});
    await page.setViewportSize({width:1100,height:900});
    root(['systemctl','stop','single-store-setup.service']);root(['systemctl','start','single-store-setup.service']);await authorize();
    await expect(page.locator('[data-phase="build"]')).toHaveAttribute('data-status','failed');
    await expect(page.locator('#checkpoint-recovery')).toBeVisible();
    await page.screenshot({path:'test-results/wizard-progress-recovery.png',fullPage:true});
    assert.equal(JSON.stringify(state()).includes(password),false);
    if(!state().has_admin){await enterAdmin();}
    await page.locator('#create-store').click();
    await expect.poll(()=>{const s=state();if(!s.busy&&!s.has_admin&&!s.complete)throw Error(s.message||'Build stopped');return!!s.has_admin||!!s.complete;},{timeout:900000}).toBe(true);
    if(!state().complete){
      // Interruption after the bootstrap transaction must preserve the existing administrator.
      root(['systemctl','stop','single-store-setup.service']);
      root(['bash','/tmp/single-store-clone/install.sh','--local-test']);await authorize();
      await expect(page.locator('#admin-fields')).toBeHidden();await page.locator('#create-store').click();
    }
    await expect(page.locator('#step4')).toBeVisible({timeout:300000});
    await expect(page.getByRole('heading',{name:'Toko Online Kamu Berhasil Dibuat!'})).toBeVisible();
    assert.equal(state().progress.phases.filter(p=>p.status==='completed').length,9);
    await page.screenshot({path:'test-results/wizard-4-complete.png',fullPage:true});
    assert.equal((await context.request.post(setup+'/api/admin',{headers,data:{}})).status(),410);
    const anonymous=await browser.newContext();assert.equal((await anonymous.request.post(setup+'/api/session',{headers,data:{token:'invalid'}})).status(),410);await anonymous.close();
    assert.equal(JSON.stringify(state()).includes(password),false);
    const logs=root(['journalctl','-u','single-store-setup.service','--no-pager']);assert.equal(logs.includes(password),false);
    pass('Wizard recovers across DNS/build/bootstrap interruption and permanently revokes setup');
  }catch(error){await page.screenshot({path:'test-results/wizard-failure.png',fullPage:true}).catch(()=>{});throw error;}
  finally{await browser.close();}
}
