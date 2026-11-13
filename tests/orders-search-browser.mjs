/** Real production build against an explicitly disposable PostgreSQL fixture. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,expect}=require('../app/node_modules/@playwright/test');
assert.equal(process.env.ORDERS181_DISPOSABLE_FIXTURE,'1');
const access=JSON.parse(readFileSync(process.env.ORDERS181_FIXTURE_ACCESS,'utf8').replace(/^\uFEFF/,''));
assert.equal(access.customer,'customer@orders181.invalid');
const origin='http://127.0.0.1:3181',out=resolve('output/orders181');mkdirSync(out,{recursive:true});
mkdirSync(resolve(out,'media'),{recursive:true});
const log=createWriteStream(resolve(out,'preview.log'));
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3181'],{
 cwd:resolve('app'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
 DATABASE_URL:'postgresql://store_app:'+access.databasePassword+'@127.0.0.1:15481/store',
 DIRECT_URL:'postgresql://store_app:'+access.databasePassword+'@127.0.0.1:15481/store',
 APP_ORIGIN:origin,NEXT_PUBLIC_BASE_URL:origin,PASSWORD_RESET_BASE_URL:origin,
 NODE_ENV:'production',JWT_SECRET:randomBytes(32).toString('hex'),STORE_INSTALLED_VERSION:'1.8.1',
 STORE_MAIL_MODE:'',STORE_MAIL_RELAY_TOKEN:'',RESEND_API_KEY:'',STORAGE_LOCAL_ROOT:resolve(out,'media').replaceAll('\\','/').replace(/^[A-Za-z]:/,''),
 }});app.stdout.pipe(log);app.stderr.pipe(log);
let browser;const checks=[],errors=[];
try{
 for(let n=0;n<60;n++){try{if((await fetch(origin+'/api/v1/ready')).ok)break;}catch{}if(n===59)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,1000));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [role,path,selector] of [['seller','/admin/orders','.simple-search'],['customer','/orders','.customer-order-search']]){
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
  const login=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:access[role],password:access.password}});assert.equal(login.status(),200,role+' fixture login');
  await context.addCookies((await context.cookies()).map(c=>({...c,secure:false})));
  await page.goto(origin+path+'?tab=all');const form=page.locator(selector);
  await expect(form.locator('svg.lucide-search')).toHaveCount(1);
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});await expect(form).toBeVisible();
   const geometry=await form.evaluate(f=>{const i=f.querySelector('input[name=q]').getBoundingClientRect(),b=f.querySelector('button[type=submit]').getBoundingClientRect();return{width:b.width,height:b.height,overlap:i.right>b.left+1,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert(geometry.width>=44&&geometry.height>=44,role+' touch target');assert(!geometry.overlap,role+' no input overlap');assert(!geometry.overflow,role+' page overflow');
   await page.screenshot({path:resolve(out,role+'-'+width+'.png')});
  }
  await form.locator('input[name=q]').fill('IDX181-00500');await form.locator('input[name=q]').press('Enter');
  await expect(page).toHaveURL(/q=IDX181-00500/);assert.equal(new URL(page.url()).searchParams.get('tab'),'all');
  await expect(page.locator('main')).toContainText('IDX181-00500');
  await form.locator('input[name=q]').fill('IDX181-00100');await form.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/q=IDX181-00100/);await expect(page.locator('main')).toContainText('IDX181-00100');
  await form.locator('input[name=q]').focus();await page.keyboard.press('Tab');await expect(form.locator('button[type=submit]')).toBeFocused();
  checks.push({role,oneMagnifier:true,widths:[390,1440],touchTarget44:true,noOverlapOrOverflow:true,enterSearch:true,buttonSearch:true,tabPreserved:true,keyboardFocus:true});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(resolve(out,'browser.json'),JSON.stringify({ok:true,productionBuild:true,disposableDatabase:true,checks,errors},null,2));console.log('Orders UI browser checks PASS');
}catch(e){writeFileSync(resolve(out,'failure.json'),JSON.stringify({name:e.name,message:e.message.slice(0,500)},null,2));throw e;}
finally{if(browser)await browser.close();app.kill();log.end();}
