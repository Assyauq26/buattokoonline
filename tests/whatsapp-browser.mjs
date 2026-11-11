import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,createWriteStream,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PrismaClient}=require('../app/node_modules/@prisma/client');
const {chromium,expect}=require('../app/node_modules/@playwright/test');
const bcrypt=require('../app/node_modules/bcryptjs');
const url=new URL(process.env.DATABASE_URL||'http://invalid');
assert(url.hostname==='127.0.0.1'&&url.pathname==='/management_v130_test');
const db=new PrismaClient(),origin='http://127.0.0.1:3107',out=resolve('output/whatsapp-audit');
mkdirSync(out,{recursive:true});mkdirSync(resolve(out,'media'),{recursive:true});let child,browser,user;const results=[];
try{
 const role=await db.role.upsert({where:{name:'Admin'},update:{},create:{name:'Admin',label:'Admin'}});
 const password=randomBytes(20).toString('hex');
 user=await db.user.create({data:{name:'WA Demo',email:randomUUID()+'@example.test',passwordHash:await bcrypt.hash(password,10),emailVerifiedAt:new Date(),roles:{create:{roleId:role.id}}}});
 const log=createWriteStream(resolve(out,'preview.log'));
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3107'],{cwd:resolve('app'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',APP_ORIGIN:origin,STORAGE_LOCAL_ROOT:resolve(out,'media').replaceAll('\\','/').replace(/^[A-Za-z]:/,''),JWT_SECRET:randomBytes(32).toString('hex'),STORE_WHATSAPP_ENABLED:'1',STORE_WHATSAPP_AUTH_ENABLED:'1',STORE_WHATSAPP_NOTIFICATIONS_ENABLED:'1',STORE_MAIL_MODE:'',RESEND_API_KEY:'',STORE_MAIL_RELAY_TOKEN:'',MAINTENANCE_MODE:'0'}});
 child.stdout.pipe(log);child.stderr.pipe(log);
 for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/v1/ready')).ok)break;}catch{}if(i===59)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,1000));}
 browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext();
 let r=await context.request.post(origin+'/api/v1/admin/whatsapp',{headers:{Origin:origin},data:{action:'qr'}});assert.equal(r.status(),403);
 r=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:user.email,password}});assert.equal(r.status(),200);
 await context.addCookies((await context.cookies()).map(c=>({...c,secure:false})));
 r=await context.request.post(origin+'/api/v1/admin/whatsapp',{headers:{Origin:'https://evil.test'},data:{action:'connect'}});assert.equal(r.status(),403);
 r=await context.request.post(origin+'/api/v1/admin/whatsapp',{headers:{Origin:origin},data:{action:'qr',sessionId:randomUUID()}});assert.equal(r.status(),422);
 results.push('Anonymous QR denied; cross-origin connect denied; caller-selected session rejected');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let status='disconnected',connects=0;
 await page.route('**/api/v1/admin/whatsapp',async route=>{
  const {action}=route.request().postDataJSON();let data;
  if(action==='connect'){connects++;status='qr_ready';}
  if(action==='disconnect')status='disconnected';
  if(action==='qr')data={qrCode:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',status};
  else if(action==='preferences')data={enabled:false,preparing:false};
  else if(action==='save')data={pending:true};
  else if(action==='history')data=[{id:randomUUID(),order_id:'ORD-SYNTHETIC-1234',state:'unknown',recipient_suffix:'2263',created_at:new Date().toISOString()}];
  else data={status,phone:status==='ready'?'+6281575652263':null,expectedPhone:'+6281575652263'};
  await route.fulfill({json:{success:true,data}});
 });
 for(const width of [360,390,430,1440]){
  await page.setViewportSize({width,height:950});await page.goto(origin+'/admin/settings/whatsapp');
  await expect(page.getByRole('heading',{name:'Integrasi WhatsApp',exact:false})).toBeVisible();
  await expect(page.getByText('Hasil belum dapat dipastikan')).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
  await page.screenshot({path:resolve(out,'settings-'+width+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Hubungkan WhatsApp',exact:true}).dblclick();assert.equal(connects,1);
 await expect(page.getByAltText('Kode QR privat untuk menghubungkan WhatsApp toko')).toBeVisible();
 status='ready';await page.getByRole('button',{name:'Periksa status'}).click();await expect(page.getByAltText('Kode QR privat untuk menghubungkan WhatsApp toko')).toHaveCount(0);
 await page.getByRole('button',{name:'Simpan preferensi'}).click();await expect(page.getByText(/Menunggu sinkronisasi/)).toBeVisible();
 results.push('Pairing double-click guarded; QR removed after connected; pending preference truthful; unknown never marked delivered');
 await page.goto(origin+'/admin/settings/security');
 await expect(page.getByRole('link',{name:'Tautkan WhatsApp',exact:true})).toHaveAttribute('href',/account=seller&mode=link/);
 const guest=await browser.newContext(),login=await guest.newPage();let confirmations=0; let confirmationState="profile_required";
 await login.goto(origin+'/register');
 await expect(login.getByRole('link',{name:'Lanjut dengan WhatsApp'})).toHaveAttribute('href',/account=customer/);
 await login.goto(origin+'/login?redirectTo=%2Fadmin');
 await expect(login.getByRole('link',{name:'Lanjut dengan WhatsApp'})).toHaveAttribute('href',/account=seller/);
 await login.getByRole('link',{name:'Lanjut dengan WhatsApp'}).click();
 await expect(login.getByRole('heading',{name:'Masuk dashboard'})).toBeVisible();
 results.push('Customer registration entry and seller login entry available; seller linking in account security');
 await login.route('**/api/v1/auth/whatsapp',route=>{
  const action=route.request().postDataJSON().action; if(action==='confirm')confirmations++;
  return route.fulfill({json:{success:true,data:action==='start'?{phone:'+6281575652263',whatsappUrl:'https://wa.me/6282211700060?text=synthetic',expiresAt:new Date(Date.now()+180000).toISOString()}:{state:action==='confirm'?confirmationState:'waiting'}}});
 });
 for(const width of [360,390,430,1440]){
  await login.setViewportSize({width,height:950});await login.goto(origin+'/whatsapp');
  await login.getByLabel('Nomor WhatsApp',{exact:true}).fill('081575652263');await login.getByRole('button',{name:'Lanjutkan',exact:true}).click();
  await expect(login.getByRole('link',{name:'Buka WhatsApp'})).toBeVisible();
  await expect(login.getByLabel('Kode dari WhatsApp')).toHaveCount(0);
  await login.getByRole('button',{name:'Gunakan kode cadangan'}).click();
  await expect(login.getByLabel('Kode dari WhatsApp')).toBeVisible();
  await expect(login.getByRole('button',{name:'Konfirmasi & Lanjutkan'})).toBeDisabled();
  assert(await login.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'login overflow '+width);
  await login.screenshot({path:resolve(out,'login-'+width+'.png'),fullPage:true});
 }
 for(const width of [360,390,430,1440]){
  await login.setViewportSize({width,height:950});
  await login.goto(origin+'/whatsapp#confirm=12345678-1234-1234-1234-123456789abc.'+'a'.repeat(64));
  await expect(login.getByRole('button',{name:'Konfirmasi & Lanjutkan'})).toBeVisible();
  assert.equal(await login.evaluate(()=>location.hash),'');
  assert.equal(confirmations,0,'link navigation must not consume credentials');
  assert(await login.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const color=await login.getByRole('button',{name:'Konfirmasi & Lanjutkan'}).evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(color,'rgb(17, 17, 17)');
  await login.screenshot({path:resolve(out,'confirm-'+width+'.png'),fullPage:true});
 }
 await login.getByRole('button',{name:'Konfirmasi & Lanjutkan'}).click();
 await expect(login.getByRole('heading',{name:'Nomor terverifikasi'})).toBeVisible();
 assert.equal(confirmations,1);
 results.push('Fragment removed; navigation does not consume link; explicit confirmation; monochrome CTA; profile required');
 confirmationState='account_link_required';
 for(const width of [390,1440]){
  await login.setViewportSize({width,height:950});
  await login.goto(origin+'/whatsapp#confirm=12345678-1234-1234-1234-123456789abc.'+'b'.repeat(64));
  await login.getByRole('button',{name:'Konfirmasi & Lanjutkan'}).click();
  await expect(login.getByRole('heading',{name:'Tautkan akun Anda'})).toBeVisible();
  await expect(login.getByRole('link',{name:'Lengkapi pendaftaran'})).toHaveCount(0);
  await expect(login.getByRole('link',{name:'Masuk dashboard seller',exact:true})).toHaveAttribute('href','/login?redirectTo=%2Fadmin');
  await expect(login.getByRole('link',{name:'Masuk akun customer'})).toBeVisible();
  assert(await login.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await login.screenshot({path:resolve(out,'existing-account-'+width+'.png'),fullPage:true});
 }
 results.push('Existing verified contact offers account linking, never registration, on mobile and desktop');

 assert.deepEqual(errors,[]);results.push('360/390/430/1440 layouts; phone challenge alone never finishes browser flow');
 writeFileSync(resolve(out,'results.json'),JSON.stringify({passed:results,evidence:'Local production build; mocked relay; no WhatsApp sent'},null,2));console.log(JSON.stringify(results));
}finally{
 await browser?.close();if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}
 if(user){await db.auditLog.deleteMany({where:{userId:user.id}});await db.user.delete({where:{id:user.id}});}await db.$disconnect();
}
