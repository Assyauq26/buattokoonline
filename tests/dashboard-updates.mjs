import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {expect}=require('@playwright/test');

/** Runs only inside the disposable install-vm harness, never against the Tencent store. */
export async function verifyDashboardUpdates({browser,context,page,base,password,sql,version,pass}){
  const endpoint=base+'/api/v1/admin/application-updates',headers={Origin:base};
  await page.setViewportSize({width:1360,height:900});
  const anon=await browser.newContext({ignoreHTTPSErrors:true});
  assert.equal((await anon.request.get(endpoint)).status(),401);await anon.close();
  for(const role of ['Customer','Manager']){
    const id='ci-update-'+role.toLowerCase(),email=id+'@example.test';
    sql(`INSERT INTO "User" (id,name,email,"passwordHash","isActive","sessionVersion","createdAt","updatedAt") SELECT '${id}','CI update access','${email}',"passwordHash",true,0,now(),now() FROM "User" LIMIT 1; INSERT INTO "UserRole" ("userId","roleId") SELECT '${id}',id FROM "Role" WHERE name='${role}';`);
    const other=await browser.newContext({ignoreHTTPSErrors:true});
    try{
      const login=await other.request.post(base+'/api/v1/auth/login',{headers,data:{identifier:email,password}});assert.equal(login.status(),200);
      assert.equal((await other.request.get(endpoint)).status(),403);
      assert.equal((await other.request.post(endpoint,{headers,data:{}})).status(),403);
    }finally{
      await other.close();
      sql(`DELETE FROM "AuditLog" WHERE "userId"='${id}'; DELETE FROM "UserRole" WHERE "userId"='${id}'; DELETE FROM "User" WHERE id='${id}';`);
    }
  }
  assert.equal((await context.request.post(endpoint,{headers:{Origin:'https://attacker.example'},data:{}})).status(),403);
  assert.equal((await context.request.post(endpoint,{data:{}})).status(),403);
  for(const data of [{command:'id'},{url:'http://169.254.169.254'},{version:'1.0.2;id'},{operation:'apply'}])assert.equal((await context.request.post(endpoint,{headers,data})).status(),422);
  const mounted=page.waitForResponse(response=>response.url()===endpoint&&response.request().method()==='GET'&&response.status()===200);
  await page.goto(base+'/admin/settings/updates');await mounted;
  const checks=await Promise.all([
    page.waitForResponse(response=>response.url()===endpoint&&response.request().method()==='POST'),
    (async()=>{await page.getByRole('button',{name:'Periksa Pembaruan',exact:true}).click();return context.request.post(endpoint,{headers,data:{}});})(),
  ]);
  assert.equal(checks.filter(response=>response.status()===200).length,1);
  assert(checks.some(response=>[409,429].includes(response.status())));
  const status=(await checks.find(response=>response.status()===200).json()).data;
  assert.equal(status.installedVersion,version);assert(status.release);assert.equal(status.execution,'cli');assert.equal(status.compatibility,'pending_cli');assert.match(status.release.sha,/^[a-f0-9]{40}$/);
  if(checks[0].status()===200)await expect(page.getByTestId('latest-version')).toHaveText('v'+status.release.version);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Pembaruan Aplikasi',exact:true})).toBeVisible();
  await expect(page.getByTestId('installed-version')).toHaveText('v'+version);
  await expect(page.getByTestId('latest-version')).toHaveText('v'+status.release.version);
  await expect(page.getByRole('button',{name:'Update Sekarang',exact:true})).toHaveCount(0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/dashboard-updates-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/dashboard-updates-mobile.png',fullPage:true});
  await page.setViewportSize({width:1360,height:900});
  pass('Dashboard reads real official GitHub release; Admin/audit authorization, CSRF, parallel/input rejection and CLI-only installation verified on desktop/mobile');
}
