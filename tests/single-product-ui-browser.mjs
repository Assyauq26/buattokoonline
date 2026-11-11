import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../app/node_modules/@prisma/client');
const { chromium } = require('../app/node_modules/playwright');
const { SignJWT } = await import('../app/node_modules/jose/dist/node/esm/index.js');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/single_product_ui_test', 'Disposable single_product_ui_test database required');
const origin = 'http://127.0.0.1:3119', secret = randomBytes(32).toString('hex');
const db = new PrismaClient(), run = randomUUID();
const out = resolve(process.env.PDP_EVIDENCE || 'output/single-product-ui');
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
let browser, child;
try {
  const { makeDefault } = require('../app/node_modules/tsx/dist/cjs/api/index.cjs').require('../app/src/modules/appearance/schema.ts', import.meta.url);
  const appearance = makeDefault();
  appearance.identity.name = 'Gheverhan';
  await db.storeAppearance.upsert({where:{key:'primary'},update:{draft:appearance,published:appearance},create:{key:'primary',draft:appearance,published:appearance}});
  await db.flashSaleControl.upsert({where:{key:'primary'},update:{},create:{key:'primary'}});
  const user = await db.user.create({data:{name:'Pembeli Uji',email:`${run}@example.test`,passwordHash:'disabled-test-only',customer:{create:{fullName:'Pembeli Uji'}}}});
  const product = await db.product.create({data:{slug:`ui-${run}`,name:'Blouse Kamila',description:'Kemeja nyaman untuk aktivitas harian. '.repeat(30),material:'Katun',careInstruction:'Cuci dengan warna senada.',basePrice:73000,salePrice:67000,status:'PUBLISHED',images:{create:[0,1,2].map(i=>({url:`/api/v1/product-images/ui-fixture-${i}`,alt:`Foto ${i+1}`,sortOrder:i}))},variants:{create:[{sku:`blue-${run}`,color:'Biru',size:'M',inventory:{create:{onHand:8}}},{sku:`green-${run}`,color:'Hijau',size:'L',inventory:{create:{onHand:8}}}]}},include:{variants:true}});
  const one = await db.product.create({data:{slug:`one-${run}`,name:'Satu Foto',basePrice:55000,status:'PUBLISHED',images:{create:{url:'/api/v1/product-images/ui-fixture-0',alt:'Satu foto'}},variants:{create:{sku:`one-${run}`,inventory:{create:{onHand:3}}}}}});
  const photos=await db.productImage.findMany({where:{productId:product.id},orderBy:{sortOrder:'asc'}});
  for(const [axis,name,values] of [['color','Warna',['Biru','Hijau']],['size','Ukuran',['M','L']]]){
    const groupId=`${axis}-${run}`;
    await db.productOptionGroup.create({data:{id:groupId,productId:product.id,name,normalizedName:name.toLowerCase(),allowsImage:axis==='color',sortOrder:axis==='color'?0:1}});
    for(const [i,value] of values.entries()){
      const valueId=`${axis}-${i}-${run}`;
      await db.productOptionValue.create({data:{id:valueId,groupId,productId:product.id,value,normalizedValue:value.toLowerCase(),sortOrder:i,imageId:axis==='color'?photos[i].id:null}});
      await db.productVariantOptionValue.create({data:{productId:product.id,groupId,valueId,variantId:product.variants.find(v=>v[axis]===value).id}});
    }
  }
  for(const variant of product.variants){
    const selections=await db.productVariantOptionValue.findMany({where:{variantId:variant.id}});
    await db.productVariant.update({where:{id:variant.id},data:{combinationKey:selections.map(v=>v.valueId).sort().join('|')}});
  }
  await db.product.update({where:{id:product.id},data:{optionsEnabled:true}});
  const { defaultSizeChart }=require('../app/node_modules/tsx/dist/cjs/api/index.cjs').require('../app/src/modules/catalog/product-size-chart.ts',import.meta.url);
  await db.product.update({where:{id:product.id},data:{sizeChart:defaultSizeChart()}});
  const empty = await db.product.create({data:{slug:`empty-${run}`,name:'Tanpa Foto',basePrice:45000,status:'PUBLISHED',variants:{create:{sku:`empty-${run}`,inventory:{create:{onHand:3}}}}}});
  const log=createWriteStream(resolve(out,'server.log'));
  const media=resolve(out,'media').replaceAll('\\','/').replace(/^[A-Za-z]:/,'');mkdirSync(media,{recursive:true});
  child=spawn(process.execPath,['node_modules/next/dist/bin/next',process.env.PDP_DEV==='1'?'dev':'start','-H','127.0.0.1','-p','3119'],{cwd:resolve('app'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin,JWT_SECRET:secret,MAINTENANCE_MODE:'0',STORAGE_LOCAL_ROOT:media}});
  child.stdout.pipe(log);child.stderr.pipe(log);
  for(let i=0;i<120;i++){try{if((await fetch(origin+'/api/v1/ready')).ok)break;}catch{}if(i===119)throw Error('Preview did not start');await new Promise(r=>setTimeout(r,1000));}
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const token=await new SignJWT({email:user.email,ver:0}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setJti(randomUUID()).setIssuedAt().setIssuer(origin).setAudience('storefront').setExpirationTime('1h').sign(new TextEncoder().encode(secret));
  await context.addCookies([{name:'store_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/api/v1/product-images/ui-fixture-*',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720"><rect width="600" height="720" fill="${['#d5dfd4','#c6d9e4','#e5d8c8'][Number(route.request().url().split('-').at(-1))]||'#ddd'}"/><path d="M180 110 60 230 120 285 180 245 160 650 440 650 420 245 480 285 540 230 420 110 360 90 300 145 240 90Z" fill="#6e8c80"/></svg>`}));
  await context.route('**/_next/image?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720"><rect width="600" height="720" fill="#d5dfd4"/><path d="M180 110 60 230 120 285 180 245 160 650 440 650 420 245 480 285 540 230 420 110 360 90 300 145 240 90Z" fill="#6e8c80"/></svg>'}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let release, locked;
  const hold=new Promise(r=>{release=r;}); const ready=new Promise(r=>{locked=r;});
  const transaction=db.$transaction(async tx=>{await tx.$executeRawUnsafe('LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE');locked();await hold;},{timeout:25000});
  await ready;
  try{
    await page.goto(origin+'/product/'+product.slug,{waitUntil:'commit'});
    await page.getByTestId('product-skeleton').waitFor({timeout:12000});
    assert.equal(await page.locator('[aria-label="Memuat halaman"] .grid-cols-2').count(),0);
    await page.screenshot({path:resolve(out,'first-load-skeleton.png')});checks.push('first HTTP navigation streams product skeleton while database waits; no Shop grid');
  }finally{release();await transaction;}
  await page.locator('[data-testid="product-skeleton"]:visible').waitFor({state:'hidden'});
  for(const width of [360,390,430,768,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(origin+'/product/'+product.slug);await page.waitForLoadState('networkidle');
    await page.getByTestId('product-gallery').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${width}`);
    if(width<768){const bounds=await page.getByTestId('product-gallery').boundingBox();assert.ok(Math.abs(bounds.x)<1&&Math.abs(bounds.width-width)<1,`edge-to-edge ${width}: ${JSON.stringify(bounds)}`);}
    assert.equal(await page.getByText('Tanya Jawab Produk',{exact:true}).count(),0);
    assert.equal(await page.getByTestId('product-gallery').getByRole('button',{name:/Foto sebelumnya|Foto berikutnya/}).count(),0);
    assert.equal(await page.getByText('Perbesar',{exact:true}).count(),0);
    const frame=await page.locator('.pdp-gallery-frame').boundingBox();
    const indicator=await page.getByRole('slider',{name:'Pilih foto produk'}).boundingBox();
    assert.ok(indicator.x>=frame.x&&indicator.x<frame.x+20&&indicator.y>frame.y+frame.height-60&&indicator.y+indicator.height<=frame.y+frame.height,'indicator overlays lower-left photo');
    const colorWidth=await page.getByRole('button',{name:'Biru',exact:true}).evaluate(el=>({button:el.getBoundingClientRect().width,row:el.parentElement.getBoundingClientRect().width,display:getComputedStyle(el.parentElement).display}));
    assert.equal(colorWidth.display,'flex');assert.ok(colorWidth.button<colorWidth.row/2,'color option follows content width');
    assert.ok(await page.getByRole('button',{name:'Biru',exact:true}).locator('img').evaluate(el=>el.complete&&el.naturalWidth>0),'variant thumbnail is loaded');
    await page.screenshot({path:resolve(out,`product-${width}.png`),fullPage:true});
    if(width===390)await page.screenshot({path:resolve(out,'product-mobile-preview.png')});
    checks.push(`${width}px: no overflow, edge-to-edge mobile gallery, lower-left indicator without arrows/zoom label, content-width colors, Q&A removed`);
  }
  await page.setViewportSize({width:390,height:844});
  const progress=page.getByRole('slider',{name:'Pilih foto produk'});
  await page.evaluate(()=>window.scrollTo(0,0));
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:320,y:280}]});
  for(const x of [280,230,180,120,60]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:280}]});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>Number(document.querySelector('[role="slider"]').getAttribute('aria-valuenow'))>1);
  assert.equal(await page.getByRole('dialog').count(),0,'swiping must not open lightbox');
  checks.push('emulated touch swipe moves photo without triggering lightbox');
  await progress.focus();await page.keyboard.press('End');
  assert.equal(await progress.getAttribute('aria-valuenow'),'3');
  await page.getByRole('button',{name:'Perbesar foto produk 3 dari 3',exact:true}).click();
  const viewer=page.getByRole('dialog');await viewer.waitFor();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
  assert.equal(await progress.getAttribute('aria-valuenow'),'2');
  await page.getByTestId('product-gallery-track').evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('[role="slider"]').getAttribute('aria-valuenow')==='1');
  checks.push('keyboard navigation, fullscreen same photo, scroll lock, Escape, retained position, native scrolling');
  await page.getByText('Deskripsi',{exact:true}).click();
  await page.getByText('Deskripsi',{exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await progress.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.emulateMedia({reducedMotion:'no-preference'});
  checks.push('accordion rapid toggle and reduced motion styles');
  await page.getByTestId(`wishlist-toggle-${product.id}`).click();
  await page.getByRole('button',{name:'Hapus dari wishlist',exact:true}).waitFor();
  checks.push('wishlist selection preserved');
  await page.getByRole('button',{name:'Biru',exact:true}).click();
  assert.ok(await page.getByRole('button',{name:'Biru',exact:true}).locator('img').evaluate(el=>el.complete&&el.naturalWidth>0),'selected variant retains thumbnail');
  assert.equal(await page.getByRole('button',{name:'Biru',exact:true}).locator('svg').count(),0,'selected variant has no checkmark');
  await page.screenshot({path:resolve(out,'variant-selected.png')});
  checks.push('assigned variant thumbnail loads and remains visible after selection, without checkmark');
  await page.getByRole('button',{name:'M',exact:true}).click();
  await page.getByTestId('qty-plus').click();assert.equal(await page.getByTestId('qty-value').textContent(),'2');
  await page.getByTestId('add-to-cart-btn').click();
  await page.getByTestId('cart-success-sheet').waitFor();
  assert.ok((await page.getByTestId('cart-success-sheet').textContent()).includes('2 ×'));
  await page.waitForFunction(()=>{const el=document.querySelector('[data-testid="purchase-dialog"]');return el&&Number(getComputedStyle(el).opacity)===1&&!el.getAnimations({subtree:true}).some(a=>a.playState==='running');});
  await page.screenshot({path:resolve(out,'cart-success.png')});
  await page.getByRole('button',{name:'Lanjut Belanja',exact:true}).click();
  assert.equal(await page.getByTestId('purchase-dialog').count(),1,'exit retains the portal for its transition');
  await page.getByTestId('purchase-dialog').waitFor({state:'hidden'});
  const cart=await db.cart.findUnique({where:{userId:user.id},include:{items:true}});
  assert.equal(cart.items[0].quantity,2);checks.push('variant, quantity, real server add-to-cart, success sheet and dismissal');
  await db.inventory.update({where:{variantId:product.variants.find(v=>v.color==='Biru').id},data:{onHand:0}});
  await page.getByTestId('add-to-cart-btn').click();
  await page.getByRole('alert').first().waitFor();
  assert.equal(await page.getByTestId('cart-success-sheet').count(),0);checks.push('server stock failure does not show success');
  await page.keyboard.press('Escape');
  await db.inventory.update({where:{variantId:product.variants.find(v=>v.color==='Biru').id},data:{onHand:8}});
  await page.goto(origin+'/product/'+product.slug);await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'Biru',exact:true}).click();await page.getByRole('button',{name:'M',exact:true}).click();
  await page.getByRole('button',{name:'Beli Sekarang',exact:true}).click();await page.waitForURL('**/checkout?**');
  assert.equal((await db.cart.findUnique({where:{userId:user.id},include:{items:true}})).items[0].quantity,2);
  checks.push('buy now enters checkout and preserves cart quantity');
  for(const item of [one,empty]){await page.goto(origin+'/product/'+item.slug);await page.waitForLoadState('networkidle');await page.screenshot({path:resolve(out,`${item===one?'one':'empty'}-photo.png`)});}
  checks.push('one-photo and empty gallery render');
  assert.deepEqual(errors,[],'browser errors');
  writeFileSync(resolve(out,'results.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,evidence:out},null,2));
}finally{await browser?.close();child?.kill();await db.$disconnect();}
