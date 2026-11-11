import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../app/node_modules/@prisma/client');
const { chromium, expect } = require('../app/node_modules/@playwright/test');
const bcrypt = require('../app/node_modules/bcryptjs');
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
assert(['127.0.0.1','localhost'].includes(database.hostname) && database.pathname === '/management_v130_test', 'Dedicated local DB only');
const db = new PrismaClient(), origin = 'http://127.0.0.1:3106', out = resolve('output/updater-audit');
mkdirSync(out, { recursive: true });
mkdirSync(resolve(out, 'media'), { recursive: true });
let child, browser, user; const results = [], secret = randomBytes(32).toString('hex'), password = randomBytes(20).toString('hex');
try {
  const role = await db.role.upsert({ where: { name: 'Admin' }, update: {}, create: { name: 'Admin', label: 'Admin' } });
  user = await db.user.create({ data: { name: 'Updater Demo', email: randomUUID()+'@example.test', passwordHash: await bcrypt.hash(password,10), emailVerifiedAt: new Date(), roles: { create: { roleId: role.id } } } });
  const log = createWriteStream(resolve(out,'preview.log'));
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3106'], { cwd: resolve('app'), windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: origin, STORAGE_LOCAL_ROOT: resolve(out,'media').replaceAll('\\','/').replace(/^[A-Za-z]:/, ''), JWT_SECRET: secret, STORE_UPDATER_ENABLED:'1', STORE_INSTALLATION_ID:'a'.repeat(32), STORE_INSTALLED_VERSION:'1.6.3', STORE_MAIL_MODE:'', RESEND_API_KEY:'', STORE_MAIL_RELAY_TOKEN:'', MAINTENANCE_MODE:'0' } });
  child.stdout.pipe(log);child.stderr.pipe(log);
  for(let i=0;i<60;i++) { try {if((await fetch(origin+'/api/v1/ready')).ok)break;}catch{} if(i===59)throw Error('preview unavailable'); await new Promise(r=>setTimeout(r,1000)); }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  let response = await context.request.post(origin+'/api/v1/admin/updater',{headers:{Origin:origin},data:{action:'status'}});
  assert.equal(response.status(),403);results.push('Anonymous start/status denied');
  response = await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{identifier:user.email,password}});
  assert.equal(response.status(),200);
  // Local HTTP test transport only; production cookie remains Secure.
  await context.addCookies((await context.cookies()).map(cookie=>({...cookie,secure:false})));
  response = await context.request.post(origin+'/api/v1/admin/updater',{headers:{Origin:'https://evil.test'},data:{action:'start',sha:'a'.repeat(40),requestKey:randomUUID()}});
  assert.equal(response.status(),403);results.push('Cross-origin request denied');
  response = await context.request.post(origin+'/api/v1/admin/updater',{headers:{Origin:origin},data:{action:'start',sha:'a'.repeat(40),requestKey:randomUUID(),url:'https://evil.test'}});
  assert.equal(response.status(),422);results.push('Caller-supplied artifact URL denied');
  response = await context.request.post(origin+'/api/v1/admin/updater',{headers:{Origin:origin},data:{action:'status'}});
  assert.equal(response.status(),503);assert(!(await response.text()).includes('/run/'));results.push('Unavailable socket returns safe error');
  const page = await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let starts=0, offline=false, expired=false, appDown=false, renewals=0;
  let status={installedVersion:'1.6.3',updaterVersion:2,checkedAt:Math.floor(Date.now()/1000),catalogError:null,release:{version:'1.7.0',sha:'a'.repeat(40),notes:'Pembaruan aplikasi toko dengan pencadangan otomatis.'},jobs:[]};
  await page.route('**/api/v1/admin/updater',async route=>{
    const action=route.request().postDataJSON().action;
    if(action==='status') {
      renewals++;
      if(appDown) return route.fulfill({status:503,json:{success:false,error:{message:'Aplikasi sedang restart'}}});
      expired=false;
    }
    if(action==='start'){starts++;status.jobs=[{id:'job-one',state:'downloading',version:'1.7.0',updated:Math.floor(Date.now()/1000),detail:{downloaded:40,total:100}}];}
    await route.fulfill({json:{success:true,data:{...status,statusToken:'test-ticket-only'}}});
  });
  await page.route('**/api/local-updater/status',async route=>expired?route.fulfill({status:401,json:{error:'session_expired'}}):offline?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:status}));
  for(const width of [360,390,430,1440]){
    await page.setViewportSize({width,height:950});await page.goto(origin+'/admin/settings/updates');
    await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toBeVisible();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
    await page.screenshot({path:resolve(out,'available-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Update sekarang',exact:true}).dblclick();
  await expect(page.getByText('Unduhan: 40%')).toBeVisible();assert.equal(starts,1);
  await page.reload();await expect(page.getByText('Unduhan: 40%')).toBeVisible();assert.equal(starts,1);results.push('Double click and reload keep same job');
  offline=true;await expect(page.getByText(/Koneksi status terputus/)).toBeVisible({timeout:15000});
  await expect(page.getByRole('heading',{name:/Mengunduh pembaruan/})).toBeVisible();results.push('Status outage does not mark job failed');
  offline=false;expired=true;appDown=true;const beforeRenewal=renewals;
  await expect.poll(()=>renewals,{timeout:20000}).toBeGreaterThan(beforeRenewal);
  appDown=false;
  await expect.poll(()=>expired,{timeout:25000}).toBe(false);
  await expect(page.getByText(/Koneksi status terputus/)).toHaveCount(0);
  assert.equal(starts,1);results.push('Expired status ticket renews after app restart without starting another job');
  offline=false;status.jobs[0].state='recovery_required';status.jobs[0].detail={error:'updater_interrupted'};
  await expect(page.getByRole('heading',{name:/Perlu bantuan operator/})).toBeVisible({timeout:15000});
  await expect(page.getByRole('button',{name:'Update sekarang',exact:true})).toHaveCount(0);
  await page.screenshot({path:resolve(out,'recovery-390.png'),fullPage:true});results.push('Recovery state blocks new update');
  status.jobs[0].state='succeeded';status.jobs[0].detail={activeVersion:'1.7.0',finishedAt:Math.floor(Date.now()/1000)};status.installedVersion='1.7.0';status.release=null;
  await expect(page.getByRole('button',{name:'Muat ulang dashboard'})).toBeVisible({timeout:15000});
  assert.equal(await page.getByRole('progressbar').getAttribute('value'),'100');
  await page.screenshot({path:resolve(out,'success-390.png'),fullPage:true});assert.deepEqual(errors,[]);
  results.push('100% only after successful backend result','Responsive 360/390/430/1440; no page errors');
  writeFileSync(resolve(out,'results.json'),JSON.stringify({passed:results,screenshots:'UI uses mocked worker status; not proof of live update'},null,2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();if(child && child.exitCode === null){child.kill();await new Promise(r=>child.once('exit',r));}
  if(user){await db.auditLog.deleteMany({where:{userId:user.id}});await db.userRole.deleteMany({where:{userId:user.id}});await db.user.delete({where:{id:user.id}});}
  await db.$disconnect();
}
