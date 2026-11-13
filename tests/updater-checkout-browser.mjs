/** Actual manual checkout in an explicitly disposable lab after traffic opens. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,expect}=require('../app/node_modules/@playwright/test');
const id=process.env.UPDATER_LAB_CASE;assert(/^[a-f0-9]{8}$/.test(id||''));
const credentials=JSON.parse(readFileSync(process.env.UPDATER_BROWSER_CREDENTIALS,'utf8').replace(/^\uFEFF/,''));
const origin='http://127.0.0.1:3198',out=resolve('promotion-evidence/updater-live-'+id);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844}});
const external=[];await context.route('**/*',r=>{if(r.request().url().startsWith(origin+'/')||r.request().url().startsWith('data:'))return r.continue();external.push(new URL(r.request().url()).origin);return r.abort();});
let page,stage='login';
try{
 const login=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:credentials.customer,password:credentials.password}});assert.equal(login.status(),200);
 await context.addCookies((await context.cookies()).map(c=>({...c,secure:false})));
 if(process.env.UPDATER_BROWSER_STATE)await context.storageState({path:process.env.UPDATER_BROWSER_STATE});
 stage='cart';const cart=await context.request.post(origin+'/api/v1/cart/items',{headers:{Origin:origin},data:{variantId:credentials.variantId,quantity:1}});assert.equal(cart.status(),201,'Cart creation status');
 page=await context.newPage();stage='checkout';await page.goto(origin+'/checkout');
 await page.locator('input[name="bankAccountId"][value="'+credentials.bankId+'"]').check();
 await page.locator('input[name="_rate"]').first().check({timeout:60000});
 stage='quote';const submit=page.getByRole('button',{name:'Buat Pesanan',exact:true});await expect(submit).toBeEnabled({timeout:60000});
 stage='submit';await submit.click();await expect(page).toHaveURL(/\/checkout\/payment\/[^/]+$/,{timeout:60000});
 const orderId=new URL(page.url()).pathname.split('/').at(-1);assert(orderId);
 await page.screenshot({path:resolve(out,'manual-checkout-after-opening.png'),fullPage:true});
 assert.deepEqual(external,[]);
 writeFileSync(resolve(out,'manual-checkout.json'),JSON.stringify({ok:true,caseId:id,orderId,actualCustomerLogin:true,actualCartAPI:true,actualShippingQuote:true,actualCheckoutServerAction:true,manualPaymentOnly:true,externalRequests:external},null,2));console.log('Actual isolated manual checkout succeeded after opening');
}catch(error){if(page)await page.screenshot({path:resolve(out,'checkout-diagnostic.png'),fullPage:true}).catch(()=>{});console.error(stage,error.name,String(error.message).split('\n')[0]);process.exitCode=1;}finally{await browser.close();}
