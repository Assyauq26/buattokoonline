import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {installWizard} from './wizard-vm.mjs';
import {verifyUpdates} from './update-vm.mjs';
import {verifyShippingSettings} from './shipping-settings-vm.mjs';
import {runRoot} from './vm-root.mjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const sharp = require('sharp');

assert(process.platform==='linux' && process.env.GITHUB_ACTIONS==='true', 'Run only on the disposable CI VM');
const password='Aa9!'+randomBytes(24).toString('base64url');
const email='admin@example.test', brand='Toko Mawar', base='https://localhost';
const reports=[];mkdirSync('test-results',{recursive:true});
const composeArgs=['docker','compose','-f','/opt/single-store/deploy/compose.yaml'];
function dc(args,input){return runRoot([...composeArgs,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:180000});}
function sql(query){return dc(['exec','-T','db','psql','-U','postgres','-d','store','-At','-v','ON_ERROR_STOP=1'],query).trim();}
function pass(name){reports.push({name,status:'PASS'});console.log('PASS:',name);writeFileSync('test-results/report.json',JSON.stringify({commit:process.env.GITHUB_SHA,os:'Ubuntu 24.04 disposable GitHub-hosted VM',checks:reports},null,2));}
await installWizard({brand,email,password,pass});
pass('Git clone and browser install.sh wizard completed on Ubuntu 24.04');
assert.equal(runRoot(['stat','-c','%a','/etc/single-store'],{encoding:'utf8'}).trim(),'700');
assert.equal(runRoot(['stat','-c','%a','/etc/single-store/runtime.env'],{encoding:'utf8'}).trim(),'600');
assert.equal(runRoot(['systemctl','is-enabled','single-store-maintenance.timer'],{encoding:'utf8'}).trim(),'enabled');
dc(['exec','-T','app','node','scripts/maintenance.mjs']);
pass('Root-only credentials and local maintenance timer');
const emptyTables=['Product','Category','Brand','Customer','Order','Review','Coupon','FlashSaleCampaign','JntIntegration','JntL3Mapping','JntMappingRelease','ProductImage','StoreBrandAsset','StoreHeroAsset'];
for(const table of emptyTables) assert.equal(sql(`SELECT count(*) FROM "${table}";`),'0',table);
assert.equal(sql('SELECT count(*) FROM "User";'),'1');
assert.equal(sql('SELECT count(*) FROM "Role" WHERE name = \'Super Admin\';'),'0');
assert.equal(sql('SELECT published->\'identity\'->>\'name\' FROM "StoreAppearance";'),brand);
assert.equal(sql('SELECT rolsuper::int FROM pg_roles WHERE rolname=\'store_app\';'),'0');
assert.equal(sql('SELECT (rolcreatedb OR rolcreaterole)::int FROM pg_roles WHERE rolname=\'store_app\';'),'0');
assert.equal(sql('SELECT rolbypassrls::int FROM pg_roles WHERE rolname=\'store_app\';'),'1');
assert.equal(runRoot(['find','/var/lib/single-store/media','-type','f'],{encoding:'utf8'}).trim(),'');
pass('Empty catalog/customer/order/promotion/carrier/media state and least-privilege runtime role');
// Block new outbound connections from the app on this disposable VM. PostgreSQL and
// Caddy remain reachable on their Docker subnets; no external service can assist the proof.
const containerId=dc(['ps','-q','app']).trim();
const networks=JSON.parse(runRoot(['docker','inspect','--format','{{json .NetworkSettings.Networks}}',containerId],{encoding:'utf8'}));
const webNetwork=networks['single-store_web'];assert(webNetwork?.IPAddress);
const subnet=runRoot(['docker','network','inspect','single-store_web','--format','{{(index .IPAM.Config 0).Subnet}}'],{encoding:'utf8'}).trim();
runRoot(['iptables','-I','DOCKER-USER','-s',webNetwork.IPAddress+'/32','!','-d',subnet,'-m','conntrack','--ctstate','NEW','-j','REJECT']);
dc(['exec','-T','app','node','-e',"fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))"]);
pass('Application outbound internet blocked before storefront/admin/product tests');
const browser=await chromium.launch({headless:true});
let context;
try {
  context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1360,height:900}});
  context.setDefaultTimeout(30000);context.setDefaultNavigationTimeout(30000);
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
  await expect(page.getByTestId('dashboard-products')).toHaveText('0');
  await expect(page.getByTestId('dashboard-products')).toBeVisible();
  await expect(page.getByTestId('dashboard-orders')).toHaveText('0');
  await page.screenshot({path:'test-results/admin-login.png',fullPage:true});
  pass('Administrator created by installer can log in through dashboard UI');
  const jnt=await (await context.request.get(base+'/api/v1/admin/integrations/jnt?environment=sandbox')).json();
  assert.equal(jnt.data.configured,false);assert.equal(jnt.data.enabled,false);
  const png=await sharp({create:{width:400,height:400,channels:3,background:'#ba344c'}}).png().toBuffer();
  await page.goto(base+'/admin/products/new');
  await page.getByRole('button',{name:'Gunakan varian sederhana',exact:true}).click();
  await page.getByLabel('Nama produk',{exact:true}).fill('Produk Uji Mawar');
  await page.locator('#product-price').fill('125000');
  await page.locator('#variant-0-sku').fill('MAWAR-UJI-001');
  await page.locator('#variant-0-stock').fill('7');
  await page.locator('#package-weight').fill('300');
  await page.locator('#product-image-upload').setInputFiles({name:'mawar-test.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('#product-images img')).toHaveCount(1,{timeout:30000});
  await page.getByTestId('publish-product').click();
  await expect(page.getByTestId('product-status')).toContainText('Terbit',{timeout:30000});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/product-created.png',fullPage:true});
  assert.equal(sql('SELECT count(*) FROM "Product";'),'1');
  assert.equal(sql('SELECT "onHand" FROM "Inventory";'),'7');
  const imagePath=sql('SELECT url FROM "ProductImage" LIMIT 1;');
  const publicImage=await context.request.get(base+imagePath);assert.equal(publicImage.status(),200);assert((await publicImage.body()).length>100);
  await page.goto(base+'/product/produk-uji-mawar');await expect(page.locator('h1')).toContainText('Produk Uji Mawar');
  await expect.poll(()=>page.getByTestId('product-gallery').locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  assert.equal(JSON.parse(await page.locator('script[type="application/ld+json"]').textContent()).brand.name,brand);
  pass('Add product, upload photo, publish, inventory and public product/image routes');
  const logoUpload=await context.request.post(base+'/api/v1/admin/store-branding',{headers:{Origin:base},multipart:{requestId:randomUUID(),image:{name:'logo-test.png',mimeType:'image/png',buffer:png}}});
  assert.equal(logoUpload.status(),201);const logoId=(await logoUpload.json()).data.id;
  assert.equal((await context.request.get(base+'/api/v1/store-branding/'+logoId)).status(),404);
  const appearance=await (await context.request.get(base+'/api/v1/admin/store-appearance')).json();
  const draft={...appearance.data.config,identity:{...appearance.data.config.identity,name:'Toko Melati',mode:'both',logoAssetId:logoId}};
  const saved=await context.request.post(base+'/api/v1/admin/store-appearance',{headers:{Origin:base},data:{kind:'save',config:draft,draftVersion:appearance.data.draftVersion,publishedVersion:appearance.data.publishedVersion}});
  assert.equal(saved.status(),200);const savedData=(await saved.json()).data;
  await page.goto(base+'/admin');await expect(page.locator('aside')).toContainText('Toko Melati');
  await expect(page).toHaveTitle('Admin | Toko Melati');
  await expect(page.locator('aside img[src*="/api/v1/admin/store-branding/"]')).toHaveCount(1);
  await page.goto(base+'/');await expect(page).toHaveTitle(brand);await expect(page.locator('body')).not.toContainText('Toko Melati');
  const published=await context.request.post(base+'/api/v1/admin/store-appearance',{headers:{Origin:base},data:{kind:'publish',draftVersion:savedData.draftVersion,publishedVersion:savedData.publishedVersion}});
  assert.equal(published.status(),200);
  await page.goto(base+'/');await expect(page).toHaveTitle('Toko Melati');
  assert.equal((await context.request.get(base+'/api/v1/store-branding/'+logoId)).status(),200);
  pass('Draft name/logo updates admin immediately; public branding changes only after Publish');
  const badOrigin=await context.request.post(base+'/api/v1/admin/store-appearance',{headers:{Origin:'https://attacker.example'},data:{}});assert.equal(badOrigin.status(),403);
  const anon=await browser.newContext({ignoreHTTPSErrors:true});
  const denied=await anon.request.get(base+'/api/v1/admin/store-appearance');assert.equal(denied.status(),401);await anon.close();
  pass('Anonymous admin reads and cross-origin writes are rejected');
  await page.goto('about:blank');
  dc(['restart','db','app','proxy']);
  await expect.poll(async()=>{try{return (await context.request.get(base+'/api/v1/ready')).status();}catch{return 0;}},{timeout:120000}).toBe(200);
  // Restarting Docker bridges can briefly invalidate Chromium's existing network path.
  // Retry only this read/navigation, retaining the same browser session cookies.
  await expect(async()=>{
    await page.goto(base+'/admin');
    await expect(page.locator('aside')).toContainText('Toko Melati');
    await expect(page.getByTestId('dashboard-products')).toHaveText('1');
    await expect(page.getByTestId('dashboard-products')).toBeVisible();
  }).toPass({timeout:60000,intervals:[1000,2000,5000]});
  await page.screenshot({path:'test-results/admin-after-restart.png',fullPage:true});
  assert.equal(sql('SELECT count(*) FROM "Product";'),'1');assert.equal(sql('SELECT "onHand" FROM "Inventory";'),'7');
  assert.equal((await context.request.get(base+imagePath)).status(),200);
  await expect(async()=>{
    await page.goto(base+'/');
    await expect(page).toHaveTitle('Toko Melati');
    await expect(page.locator('body')).toContainText('Produk Uji Mawar');
  }).toPass({timeout:60000,intervals:[1000,2000,5000]});
  await page.setViewportSize({width:390,height:844});
  const cardImage=page.getByTestId('product-card-produk-uji-mawar').locator('img');
  await expect(cardImage).toBeVisible();
  await expect.poll(()=>cardImage.evaluate(img=>img.complete&&img.naturalWidth>0),{timeout:30000}).toBe(true);
  await page.screenshot({path:'test-results/storefront-after-restart-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  pass('Database, administrator session, brand, product stock and photo survive service restart');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const html=await page.content();assert(!/Ghever|JetSeller|Buat Toko Online Sendiri|BTOS/i.test(html));
  pass('No external browser dependency, source store branding or browser runtime errors');
  // Exercise the seller's offline import tooling with public region names and synthetic
  // carrier codes. No private carrier dataset, credential or live request is used.
  const reference=JSON.parse(gunzipSync(readFileSync(new URL('../app/src/modules/regions/data/snapshot.json.gz',import.meta.url))).toString());
  const province=reference.provinces.data[0],city=reference['regencies/'+province.code].data[0],district=reference['districts/'+city.code].data[0];
  mkdirSync('/tmp/store-jnt-proof/reports',{recursive:true,mode:0o700});
  const csvRow=[province.name,city.name,district.name,province.name,city.name,'TST',district.name,'TST01'].map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
  writeFileSync('/tmp/store-jnt-proof/input.csv','Provinsi,Kota,Kecamatan,Provinsi JNT,Kota JNT,Kode Kota JNT,Kecamatan JNT,Kode JNT\n'+csvRow+'\n',{mode:0o600});
  runRoot(['mkdir','-p','/tmp/store-jnt-proof/reports']);
  runRoot(['tee','/tmp/store-jnt-proof/input.csv'],{input:readFileSync('/tmp/store-jnt-proof/input.csv')});
  const mappingArgs=['run','--rm','-T','--user','0:0','-v','/tmp/store-jnt-proof/input.csv:/app/resources/jnt-l3-official.csv:ro','-v','/tmp/store-jnt-proof/reports:/app/.jnt-mapping-report'];
  const preview=JSON.parse(dc([...mappingArgs,'tools','node','scripts/jnt/reconcile-l3.mjs','--preview']));assert.equal(preview.exact,1);
  assert.throws(()=>dc([...mappingArgs,'-e','JNT_MAPPING_IMPORT_APPROVED=yes','-e','JNT_MAPPING_EXPECTED_ROWS=2','tools','node','scripts/jnt/reconcile-l3.mjs','--stage']));
  assert.equal(sql('SELECT count(*) FROM "JntL3Mapping";'),'0');
  const reviewedArgs=[...mappingArgs,'-e','JNT_MAPPING_IMPORT_APPROVED=yes','-e','JNT_MAPPING_EXPECTED_ROWS=1'];
  dc([...reviewedArgs,'tools','node','scripts/jnt/reconcile-l3.mjs','--stage']);
  dc([...reviewedArgs,'-e','JNT_MAPPING_APPROVED_VERSION='+preview.version,'-e','JNT_MAPPING_REVIEWER=synthetic-test','tools','node','scripts/jnt/reconcile-l3.mjs','--activate']);
  assert.equal(sql('SELECT "activeVersion" FROM "JntMappingRelease";'),preview.version);
  assert.equal(sql('SELECT count(*) FROM "JntIntegration";'),'0');
  pass('Offline J&T mapping review/stage/activation with synthetic CSV; no carrier credentials or calls');
  const village=reference['villages/'+district.code].data[0];
  await verifyShippingSettings({page,context,base,sql,dc,province,city,district,village,pass,expect});
  await verifyUpdates({context,base,email,password,pass,sql,dc});
} catch(error) {
  reports.push({name:'Failure',status:'FAIL',message:String(error)});
  writeFileSync('test-results/report.json',JSON.stringify({checks:reports},null,2));
  if(context) await context.pages()[0]?.screenshot({path:'test-results/failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}
