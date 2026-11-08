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
const dbUrl = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(dbUrl.hostname) && dbUrl.pathname === '/management_v130_test', 'Isolated database required');
const origin = 'http://127.0.0.1:3102', secret = randomBytes(32).toString('hex');
const db = new PrismaClient(), run = randomUUID();
const { makeDefault } = require('../app/node_modules/tsx/dist/cjs/api/index.cjs').require('../app/src/modules/appearance/schema.ts', import.meta.url);
const appearance = makeDefault();
const out = resolve(process.env.MANAGEMENT_EVIDENCE || 'management-evidence'); mkdirSync(out, { recursive: true });
let browser, child;
const checks = [];
try {
  const adminRole = await db.role.findUniqueOrThrow({ where: { name: 'Admin' } });
  const permissionKeys = ['product.read','product.create','product.update','product.delete','inventory.read','order.read','customer.read','customer.update','customer.delete','bank.manage','store.customize.read','store.customize.update','store.customize.publish'];
  for (const key of permissionKeys) {
    const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, label: key } });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, update: {}, create: { roleId: adminRole.id, permissionId: permission.id } });
  }
  const admin = await db.user.create({ data: { name: 'Operator Demo', email: `${run}-admin@example.test`, passwordHash: 'disabled-e2e-login', roles: { create: { roleId: adminRole.id } } } });
  const customer = await db.user.create({ data: { name: 'Pelanggan Demo', email: `${run}-customer@example.test`, phone: '+628' + Date.now().toString().slice(-10), passwordHash: 'disabled-e2e-login', customer: { create: { fullName: 'Pelanggan Demo', addresses: { create: [{ recipientName: 'Pelanggan Demo', phone: '081234567890', line: 'Jalan Contoh Nomor 1', city: 'Batang', province: 'Jawa Tengah', district: 'Warungasem', village: 'Banjaran', postalCode: '', isDefault: true }, { recipientName: 'Pelanggan Demo', phone: '081234567890', line: 'Jalan Contoh Nomor 2', city: 'Batang', province: 'Jawa Tengah', postalCode: '' }] } } } } });
  const category = await db.category.create({ data: { name: 'Kategori Demo', slug: 'demo-' + run } });
  for (let i = 0; i < 25; i++) await db.product.create({ data: { name: `Produk Demo ${String(i).padStart(2, '0')} Nama Variasi Panjang`, slug: `${run}-${i}`, basePrice: i === 0 ? 19990000 : 89000, salePrice: i === 0 ? 12990000 : 59000, status: 'DRAFT', categoryId: category.id, variants: { create: { sku: `${run}-${i}`, inventory: { create: { onHand: 10 } } } } } });
  await db.storeAppearance.upsert({ where: { key: 'primary' }, update: { draft: appearance, published: appearance }, create: { key: 'primary', draft: appearance, published: appearance } });
  await db.flashSaleControl.upsert({ where: { key: 'primary' }, update: {}, create: { key: 'primary' } });
  const media = process.platform === 'win32' ? '/Users/HYPE AI/Documents/ChatGPT/Buat Toko Online/audit-tools/management-v130-media' : resolve(out, 'media');
  mkdirSync(media, { recursive: true });
  const log = createWriteStream(resolve(out, 'preview.log'));
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3102'], { cwd: resolve('app'), windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, APP_ORIGIN: origin, STORAGE_LOCAL_ROOT: media, MAINTENANCE_MODE: '0', JWT_SECRET: secret, STORE_MAIL_RELAY_TOKEN: '', RESEND_API_KEY: '', STORE_MAIL_MODE: '', REGISTRATION_OTP_TEST_SINK: '', NODE_ENV: 'production' } });
  child.stdout.pipe(log); child.stderr.pipe(log);
  for (let i = 0; i < 90; i++) { try { if ((await fetch(origin + '/api/v1/ready')).ok) break; } catch {} if (i === 89) throw Error('Preview failed'); await new Promise(r => setTimeout(r, 1000)); }
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  async function context(user) {
    const token = await new SignJWT({ email: user.email, ver: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setJti(randomUUID()).setIssuedAt().setIssuer(origin).setAudience('storefront').setExpirationTime('1h').sign(new TextEncoder().encode(secret));
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'store_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
    return ctx;
  }
  const staffContext = await context(admin), customerContext = await context(customer);
  const staffPage = await staffContext.newPage(), accountPage = await customerContext.newPage();
  staffPage.on('dialog', d => d.accept()); accountPage.on('dialog', d => d.accept());
  for (const width of [360, 390, 768, 1024, 1280, 1440]) {
    for (const [page, path, name] of [[staffPage, '/admin/products', 'products'], [staffPage, '/admin/bank-accounts', 'banks'], [staffPage, `/admin/customers/${customer.id}`, 'customer'], [accountPage, '/account', 'account']]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(origin + path); assert.equal(response.status(), 200, `${name} HTTP`); await page.waitForLoadState('networkidle');
      assert.ok(!page.url().includes('/login'), `Session on ${path}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} overflow at ${width}`);
      await page.screenshot({ path: resolve(out, `${name}-${width}.png`), fullPage: true });
      checks.push(`${name} ${width}: no overflow`);
    }
  }
  await staffPage.setViewportSize({ width: 390, height: 844 }); await staffPage.goto(origin + '/admin/products'); await staffPage.waitForLoadState('networkidle');
  const more = staffPage.getByRole('button', { name: 'Lainnya', exact: true });
  await more.click(); await assertExpanded(true); await staffPage.keyboard.press('Escape'); await assertExpanded(false);
  await more.click(); await staffPage.getByRole('heading', { name: 'Produk', exact: true }).click(); await assertExpanded(false);
  await more.click(); await more.click(); await assertExpanded(false); checks.push('Mobile menu toggle / Escape / outside click');
  async function assertExpanded(value) { await staffPage.waitForFunction(({ value }) => document.querySelector('button[aria-label="Lainnya"]')?.getAttribute('aria-expanded') === String(value), { value }); }
  assert.equal(await staffPage.getByText('Banner Hero', { exact: true }).count(), 0);
  await staffPage.getByRole('combobox', { name: 'Filter kategori' }).selectOption(category.id);
  await staffPage.getByRole('textbox', { name: 'Cari produk' }).fill('Produk Demo 00'); await staffPage.getByRole('button', { name: 'Cari', exact: true }).click();
  console.log('Search location:', staffPage.url()); await staffPage.waitForURL(/q=/); await staffPage.getByRole('link', { name: 'Produk Demo 00 Nama Variasi Panjang' }).waitFor(); checks.push('Product search');
  await staffPage.getByRole('button', { name: 'Aksi Produk Demo 00 Nama Variasi Panjang' }).click(); await staffPage.getByRole('button', { name: 'Hapus produk', exact: true }).click();
  await staffPage.waitForTimeout(1000); assert.equal(await db.product.count({ where: { slug: `${run}-0` } }), 0); checks.push('Product delete through UI');
  await staffPage.goto(origin + '/admin/bank-accounts');
  await staffPage.getByLabel('Nama Bank', { exact: true }).fill('BCA'); await staffPage.getByLabel('Nomor Rekening', { exact: true }).fill('0012345678'); await staffPage.getByLabel('Nama Pemilik', { exact: true }).fill('Pemilik Demo'); await staffPage.getByLabel('Nama Tampilan', { exact: true }).fill('Rekening Browser ' + run);
  await staffPage.getByRole('button', { name: 'Simpan Rekening' }).click(); await staffPage.getByText('Rekening ditambahkan.', { exact: true }).waitFor(); checks.push('Bank create through UI');
  await staffPage.waitForLoadState('networkidle');
  const bankCard = () => staffPage.locator('article').filter({ hasText: 'Rekening Browser ' + run });
  await bankCard().getByRole('button', { name: 'Edit', exact: true }).click();
  await staffPage.getByLabel('Nomor Rekening', { exact: true }).fill('0098765432');
  await staffPage.getByRole('button', { name: 'Simpan Rekening' }).click();
  await bankCard().getByText('BCA · 0098765432', { exact: true }).waitFor();
  await bankCard().getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await bankCard().getByRole('button', { name: 'Aktifkan', exact: true }).waitFor();
  await bankCard().getByRole('button', { name: 'Hapus', exact: true }).click();
  await bankCard().waitFor({ state: 'detached' }); checks.push('Bank edit / disable / delete through UI');
  await accountPage.goto(origin + '/account'); await accountPage.getByLabel('Nama', { exact: true }).fill('Profil Browser Diperbarui'); await accountPage.getByRole('button', { name: 'Simpan Profil' }).click(); await accountPage.getByText('Profil berhasil diperbarui.', { exact: true }).waitFor();
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: customer.id } })).name, 'Profil Browser Diperbarui'); checks.push('Customer profile through UI');
  await accountPage.getByRole('button', { name: 'Jadikan Utama' }).first().click(); await accountPage.getByText('Alamat utama diperbarui.', { exact: true }).waitFor(); checks.push('Customer default address through UI');
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ passed: checks, productionWrites: false }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, evidence: out }));
} finally {
  if (browser) await browser.close(); if (child) child.kill(); await db.$disconnect();
}
