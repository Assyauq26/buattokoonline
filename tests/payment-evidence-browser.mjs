// Authenticated responsive smoke against an isolated local fixture DB only.
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
assert.ok(url.protocol === 'postgresql:' && url.hostname === '127.0.0.1' && url.port === '5568' && url.pathname === '/hubify_payment_evidence_test', 'Isolated payment fixture DB required');
const db = new PrismaClient(), run = randomUUID(), origin = 'http://127.0.0.1:3018';
const secret = randomBytes(32).toString('hex'), installation = 'browser-' + run;
const out = resolve(process.env.PAYMENT_EVIDENCE_OUTPUT || 'payment-evidence-browser-output');
mkdirSync(out, { recursive: true });
let child, browser;
const checks = [], errors = [];
try {
  const role = await db.role.upsert({ where: { name: 'Admin' }, update: {}, create: { name: 'Admin', label: 'Admin' } });
  for (const key of ['payment.read', 'payment.verify', 'bank.manage']) {
    const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, label: key } });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  const admin = await db.user.create({ data: { name: 'Fixture seller', email: `${run}@example.test`, passwordHash: 'disabled-browser-fixture', roles: { create: { roleId: role.id } } } });
  const source = await db.paymentEvidenceSource.create({ data: { storeScope: installation, kind: 'GMAIL_BANK', label: 'Notifikasi rekening toko', accountRef: 'synthetic-incoming-' + run } });
  const windowStart = new Date(), expiresAt = new Date(+windowStart + 5 * 60000), orderNumber = 'PAYMENT-WINDOW-' + run.slice(0,8);
  const payment = await db.payment.create({ data: { amount: 45341, order: { create: { orderNumber, userId: admin.id, subtotal: 45000, total: 45341, expiresAt } } } });
  await db.paymentEvidenceAttempt.create({ data: { sourceId: source.id, paymentId: payment.id, baseAmount: 45000, uniqueCode: 341, payable: 45341, expiresAt, retainUntil: new Date(+expiresAt + 7*86400000) } });
  const evidence = await db.incomingPaymentEvidence.create({ data: { sourceId: source.id, externalId: 'synthetic-1', fingerprint: 'synthetic-only', amount: 45341, occurredAt: new Date(+windowStart + 30000), currency: 'IDR', direction: 'CREDIT', providerStatus: 'UNKNOWN', accountRef: source.accountRef, trusted: false, reason: 'MISSING_STABLE_TRANSACTION_ID' } });
  const log = createWriteStream(resolve(out, 'server.log'));
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3018'], { cwd: resolve('app'), env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: origin, JWT_SECRET: secret, DIRECT_URL: process.env.DATABASE_URL, STORE_INSTALLATION_ID: installation, PAYMENT_EVIDENCE_PREVIEW: 'true', PAYMENT_GMAIL_OAUTH_TEST: 'false', PAYMENT_GOOGLE_CLIENT_ID: '', PAYMENT_GOOGLE_CLIENT_SECRET: '', PAYMENT_INTEGRATION_ENCRYPTION_KEY: '', PAYMENT_PROVIDER: 'manual', MAINTENANCE_MODE: '0', REGION_DATA_MODE: 'snapshot' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('Local server exited; inspect server.log');
    try { if ((await fetch(origin + '/api/v1/health')).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'Local server ready');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const token = await new SignJWT({ email: admin.email, ver: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(admin.id).setJti(run).setIssuedAt().setIssuer(origin).setAudience('storefront').setExpirationTime('30m').sign(new TextEncoder().encode(secret));
  await context.addCookies([{ name: 'store_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    for (const [path, heading, name] of [
      ['/admin/settings/payment-methods', 'Metode Pembayaran', 'methods'],
      ['/admin/settings/payment-methods/gopay-qris', 'QRIS GoPay Merchant', 'gopay'],
      ['/admin/settings/payment-methods/gmail-bank', 'Notifikasi bank melalui Gmail', 'gmail'],
      ['/admin/payments/evidence', 'Perlu pemeriksaan', 'review'],
      [`/admin/payments/evidence/${evidence.id}`, 'Pemeriksaan bukti pembayaran', 'detail'],
    ]) {
      const response = await page.goto(origin + path);
      assert.equal(response.status(), 200, path);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      if (name === 'detail') {
        await page.getByRole('heading', { name: 'Pencocokan nominal & waktu' }).waitFor();
        await page.getByText(orderNumber, { exact: true }).waitFor();
        await page.getByText(/kode unik Rp 341/).waitFor();
        assert.equal(await page.getByRole('button', { name: /Kaitkan bukti/ }).count(), 0);
        checks.push(`${viewport.width}: Rp45.341 matches without payer/reference and without paid action`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow ${path} ${viewport.width}`);
      await page.screenshot({ path: resolve(out, `${name}-${viewport.width}.png`), fullPage: true });
      checks.push(`${viewport.width}: ${path}`);
    }
  }
  await page.goto(origin + '/admin/settings/payment-methods/gopay-qris');
  await page.getByLabel('Nama koneksi', { exact: true }).fill('Invalid QR fixture');
  await page.getByLabel('ID merchant (bukan token atau password)').fill('test-merchant');
  await page.getByLabel('Teks QRIS statis', { exact: false }).fill('invalid');
  await page.getByRole('button', { name: 'Simpan draf · tetap nonaktif' }).click();
  await page.getByRole('status').filter({ hasText: /QRIS|TLV/ }).waitFor();
  checks.push('Invalid QR rejected through UI without creating source');
  await page.goto(origin + `/admin/payments/evidence/${evidence.id}`);
  assert.equal(await page.getByRole('button', { name: /Kaitkan bukti/ }).count(), 0);
  checks.push('Untrusted evidence has no association/paid action');
  await page.goto(origin + '/admin/settings/payment-methods/gmail-bank');
  assert.ok(await page.getByRole('button', { name: 'Hubungkan Google' }).isDisabled());
  checks.push('Google connection unavailable without operator setup');
  const badOrigin = await context.request.post(origin + '/api/v1/admin/payment-evidence', { headers: { Origin: 'https://untrusted.example.test' }, data: { action: 'disconnect', sourceId: source.id } });
  assert.equal(badOrigin.status(), 403); checks.push('Cross-origin mutation rejected');
  const activation = await context.request.post(origin + '/api/v1/admin/payment-evidence', { headers: { Origin: origin }, data: { action: 'create', input: { kind: 'GMAIL_BANK', label: 'Cannot activate', accountRef: 'test', enabled: true } } });
  assert.equal(activation.status(), 422); checks.push('Client cannot activate source by adding enabled flag');
  const unauth = await browser.newContext();
  const denied = await unauth.request.post(origin + '/api/v1/admin/payment-evidence', { headers: { Origin: origin }, data: { action: 'disconnect', sourceId: source.id } });
  assert.equal(denied.status(), 401); checks.push('Anonymous mutation rejected');
  assert.equal(await db.paymentEvidenceSource.count({ where: { storeScope: installation, enabled: true } }), 0);
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ passed: checks, runtimeErrors: errors, fixtureSessions: true, actualLoginTested: false, realMerchantOrBankTraffic: false, productionWrites: false }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, evidence: out }));
} finally {
  if (browser) await browser.close();
  if (child) child.kill();
  await db.$disconnect();
}
