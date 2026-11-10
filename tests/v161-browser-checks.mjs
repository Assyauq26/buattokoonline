import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export async function verifyReview({page,origin,orderId,checks,out}){
 const dialog=page.getByRole('dialog');
 for(const width of [360,390,430,1440]){
  await page.setViewportSize({width,height:900});
  await dialog.getByRole('heading',{name:'Buat resi pengiriman'}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Kembali',exact:true}).count(),0);
  assert.equal(await dialog.locator('details').getAttribute('open'),null);
  assert.equal(await dialog.locator('.shipping-review-weight span span').evaluate(e=>e.clientHeight <= parseFloat(getComputedStyle(e).lineHeight)+1),true);
  assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.screenshot({path:resolve(out,`shipping-modal-${width}.png`)});
 }
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await dialog.getByRole('button',{name:'Tutup',exact:true}).focus();
 await page.keyboard.press('Shift+Tab');
 assert.equal(await dialog.evaluate(e=>e.contains(document.activeElement)),true);
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.equal(await page.locator('.simple-detail').getByText('Bantuan',{exact:true}).count(),0);
 assert.equal(await page.locator('.simple-detail').getByText('Status Pesanan',{exact:true}).count(),1);
 await dialog.getByText('Lihat rincian barang').click();
 await dialog.getByText('Biru / Panjang / XL',{exact:false}).waitFor();
 await dialog.getByText('Lihat rincian barang').click();
 const weight=dialog.getByRole('spinbutton');await weight.fill('0');assert.equal(await dialog.getByRole('button',{name:'Periksa tarif',exact:true}).isDisabled(),true);await weight.fill('700');
 await dialog.getByRole('button',{name:'Ubah',exact:true}).click();
 await dialog.getByLabel('Nama penerima',{exact:true}).fill('Penerima contoh');
 let patch=0,dispatch=0;
 await page.route(`**/api/v1/admin/orders/${orderId}/shipping-review`,async route=>{
  if(route.request().method()==='GET')return route.continue();
  const v=route.request().postDataJSON();assert.equal(v.weightGram,700);assert.equal(v.recipientName,'Penerima contoh');
  if(route.request().method()==='PATCH'){patch++;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,error:{message:'Tarif berubah. Periksa kembali.'}})});}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{rate:14000,charged:7000}})});
 });
 await dialog.getByRole('button',{name:'Periksa tarif',exact:true}).click();
 await dialog.getByText('Saya menyetujui selisih tarif',{exact:false}).waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Simpan perubahan',exact:true}).isDisabled(),true);
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Simpan perubahan',exact:true}).click();
 await dialog.getByRole('alert').waitFor();assert.equal(await weight.inputValue(),'700');assert.equal(patch,1);
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
 await page.unroute(`**/api/v1/admin/orders/${orderId}/shipping-review`);
 await page.getByRole('button',{name:'Buat resi',exact:true}).click();await dialog.getByRole('spinbutton').waitFor();
 await page.route(`**/api/v1/admin/orders/${orderId}/jnt`,async route=>{dispatch++;assert.match(route.request().postDataJSON().reviewFingerprint,/^[a-f0-9]{64}$/);await new Promise(r=>setTimeout(r,300));return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,error:{message:'Hasil belum pasti; rekonsiliasi diperlukan'}})});});
 await dialog.getByRole('button',{name:'Buat resi',exact:true}).dblclick();await dialog.getByRole('alert').waitFor();assert.equal(dispatch,1);
 await page.keyboard.press('Escape');await page.unroute(`**/api/v1/admin/orders/${orderId}/jnt`);
 await page.getByRole('button',{name:'Buat resi',exact:true}).click();await dialog.getByRole('spinbutton').waitFor();
 checks.push('v161: responsive sheet 360/390/430/1440; closed items; edit/weight; explicit rate difference; preserved errors; single create dispatch; Escape; no carrier call');
}
