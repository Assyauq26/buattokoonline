import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const sharp = require('sharp');

assert(process.platform==='linux' && process.env.GITHUB_ACTIONS==='true', 'Run only on the disposable CI VM');
const password=randomBytes(24).toString('base64url');
const email='admin@example.test', brand='Toko Mawar', base='https://localhost';
const reports=[];mkdirSync('test-results',{recursive:true});
const composeArgs=['docker','compose','-f','/opt/single-store/deploy/compose.yaml'];
function dc(args,input){return execFileSync('sudo',[...composeArgs,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:180000});}
function sql(query){return dc(['exec','-T','db','psql','-U','postgres','-d','store','-At','-v','ON_ERROR_STOP=1'],query).trim();}
function pass(name){reports.push({name,status:'PASS'});console.log('PASS:',name);writeFileSync('test-results/report.json',JSON.stringify({commit:process.env.GITHUB_SHA,os:'Ubuntu 24.04 disposable GitHub-hosted VM',checks:reports},null,2));}
await new Promise((resolve,reject)=>{
  // The actual installer prompts are supplied through stdin; password never enters arguments or files.
  const p=spawn('sudo',['bash','/tmp/single-store-clone/install.sh','--local-test'],{stdio:['pipe','inherit','inherit']});
  p.stdin.end([brand,'localhost',email,password,password,'INSTALL',''].join('\n'));
  p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`install.sh exited ${code}`)));
});
pass('Git clone and interactive install.sh completed on Ubuntu 24.04');
assert.equal(execFileSync('sudo',['stat','-c','%a','/etc/single-store'],{encoding:'utf8'}).trim(),'700');
assert.equal(execFileSync('sudo',['stat','-c','%a','/etc/single-store/runtime.env'],{encoding:'utf8'}).trim(),'600');
assert.equal(execFileSync('sudo',['systemctl','is-enabled','single-store-maintenance.timer'],{encoding:'utf8'}).trim(),'enabled');
dc(['exec','-T','app','node','scripts/maintenance.mjs']);
pass('Root-only credentials and local maintenance timer');
const emptyTables=['Product','Category','Brand','Customer','Order','Review','Coupon','FlashSaleCampaign','JntIntegration','ProductImage','StoreBrandAsset','StoreHeroAsset'];
for(const table of emptyTables) assert.equal(sql(`SELECT count(*) FROM "${table}";`),'0',table);
assert.equal(sql('SELECT count(*) FROM "User";'),'1');
assert.equal(sql('SELECT count(*) FROM "Role" WHERE name = \'Super Admin\';'),'0');
assert.equal(sql('SELECT published->\'identity\'->>\'name\' FROM "StoreAppearance";'),brand);
assert.equal(sql('SELECT rolsuper::int FROM pg_roles WHERE rolname=\'store_app\';'),'0');
assert.equal(execFileSync('sudo',['find','/var/lib/single-store/media','-type','f'],{encoding:'utf8'}).trim(),'');
pass('Empty catalog/customer/order/promotion/carrier/media state and least-privilege runtime role');
const browser=await chromium.launch({headless:true});
let context;
try {
  context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1360,height:900}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // All browser traffic stays on this store, even while every external request is blocked.
  const external=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(!['localhost','127.0.0.1'].includes(url.hostname)){external.push(url.hostname);await route.abort();}else await route.continue();
  });
  await page.goto(base+'/');await expect(page.locator('body')).toContainText(brand);await expect(page).toHaveTitle(brand);
  await expect(page.locator('body')).toContainText('Belum ada produk');
  await page.screenshot({path:'test-results/empty-storefront.png',fullPage:true});
  assert.equal((await (await context.request.get(base+'/api/v1/products')).json()).data.items.length,0);
  pass('Brand header, metadata, empty storefront and public products API');
  await page.goto(base+'/login?redirectTo=/admin');
  await page.getByTestId('login-identifier').fill(email);await page.getByTestId('login-password').fill(password);
  await page.getByRole('button',{name:'Masuk',exact:true}).click();
  await expect(page).toHaveURL(/\/admin$/,{timeout:30000});
  await expect(page.locator('aside')).toContainText(brand);
  await page.screenshot({path:'test-results/admin-login.png',fullPage:true});
  pass('Administrator created by installer can log in through dashboard UI');
  const jnt=await (await context.request.get(base+'/api/v1/admin/integrations/jnt?environment=sandbox')).json();
  assert.equal(jnt.data.configured,false);assert.equal(jnt.data.enabled,false);
  const png=await sharp({create:{width:400,height:400,channels:3,background:'#ba344c'}}).png().toBuffer();
  await page.goto(base+'/admin/products/new');
  await page.getByRole('button',{name:'Gunakan varian sederhana',exact:true}).click();
  await page.getByLabel('Nama produk',{exact:true}).fill('Produk Uji Mawar');
  await page.getByLabel('Harga normal (Rp)',{exact:true}).fill('125000');
  await page.locator('#variant-0-sku').fill('MAWAR-UJI-001');
  await page.locator('#variant-0-stock').fill('7');
  await page.locator('#package-weight').fill('300');
  await page.locator('#product-image-upload').setInputFiles({name:'mawar-test.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('#product-images img')).toHaveCount(1,{timeout:30000});
  await page.getByTestId('publish-product').click();
  await expect(page.getByTestId('product-status')).toContainText('Terbit',{timeout:30000});
  await page.screenshot({path:'test-results/product-created.png',fullPage:true});
  assert.equal(sql('SELECT count(*) FROM "Product";'),'1');
  assert.equal(sql('SELECT "onHand" FROM "Inventory";'),'7');
  const imagePath=sql('SELECT url FROM "ProductImage" LIMIT 1;');
  const publicImage=await context.request.get(base+imagePath);assert.equal(publicImage.status(),200);assert((await publicImage.body()).length>100);
  await page.goto(base+'/product/produk-uji-mawar');await expect(page.locator('h1')).toContainText('Produk Uji Mawar');
  pass('Add product, upload photo, publish, inventory and public product/image routes');
  const appearance=await (await context.request.get(base+'/api/v1/admin/store-appearance')).json();
  const draft={...appearance.data.config,identity:{...appearance.data.config.identity,name:'Toko Melati'}};
  const saved=await context.request.post(base+'/api/v1/admin/store-appearance',{headers:{Origin:base},data:{kind:'save',config:draft,draftVersion:appearance.data.draftVersion,publishedVersion:appearance.data.publishedVersion}});
  assert.equal(saved.status(),200);const savedData=(await saved.json()).data;
  await page.goto(base+'/admin');await expect(page.locator('aside')).toContainText('Toko Melati');
  await page.goto(base+'/');await expect(page).toHaveTitle(brand);await expect(page.locator('body')).not.toContainText('Toko Melati');
  const published=await context.request.post(base+'/api/v1/admin/store-appearance',{headers:{Origin:base},data:{kind:'publish',draftVersion:savedData.draftVersion,publishedVersion:savedData.publishedVersion}});
  assert.equal(published.status(),200);
  await page.goto(base+'/');await expect(page).toHaveTitle('Toko Melati');
  pass('Draft branding updates admin immediately; public brand changes only after Publish');
  const badOrigin=await context.request.post(base+'/api/v1/admin/store-appearance',{headers:{Origin:'https://attacker.example'},data:{}});assert.equal(badOrigin.status(),403);
  const anon=await browser.newContext({ignoreHTTPSErrors:true});
  const denied=await anon.request.get(base+'/api/v1/admin/store-appearance');assert.equal(denied.status(),401);await anon.close();
  pass('Anonymous admin reads and cross-origin writes are rejected');
  dc(['restart','db','app','proxy']);
  await expect.poll(async()=>{try{return (await context.request.get(base+'/api/v1/ready')).status();}catch{return 0;}},{timeout:120000}).toBe(200);
  await page.goto(base+'/admin');await expect(page.locator('aside')).toContainText('Toko Melati');
  assert.equal(sql('SELECT count(*) FROM "Product";'),'1');assert.equal(sql('SELECT "onHand" FROM "Inventory";'),'7');
  assert.equal((await context.request.get(base+imagePath)).status(),200);
  await page.goto(base+'/');await expect(page).toHaveTitle('Toko Melati');await expect(page.locator('body')).toContainText('Produk Uji Mawar');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/storefront-after-restart-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  pass('Database, administrator session, brand, product stock and photo survive service restart');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const html=await page.content();assert(!/Gheverhan|JetSeller|Buat Toko Online Sendiri|BTOS/i.test(html));
  pass('No external browser dependency, source store branding or browser runtime errors');
} catch(error) {
  reports.push({name:'Failure',status:'FAIL',message:String(error)});
  writeFileSync('test-results/report.json',JSON.stringify({checks:reports},null,2));
  if(context) await context.pages()[0]?.screenshot({path:'test-results/failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}
