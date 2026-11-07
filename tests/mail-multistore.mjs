import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '../app/node_modules/@prisma/client/default.js';
import { createRelayServer } from '../services/mail-relay/http.mjs';
import { parseRegistry, hashRelayValue } from '../services/mail-relay/relay.mjs';
import { openQuota } from '../services/mail-relay/quota.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = fileURLToPath(new URL('../app/', import.meta.url));
const connection = new URL(process.env.MAIL_TEST_DATABASE_URL || '');
if (connection.hostname !== '127.0.0.1' || connection.pathname !== '/postgres') throw Error('Use loopback disposable PostgreSQL /postgres');
const admin = new PrismaClient({ datasources: { db: { url: connection.href } } });
const children = [], created = [], databases = [], messages = [];
const media = mkdtempSync(join(tmpdir(), 'btos-mail-media-'));
const password = 'Test!' + randomBytes(18).toString('hex');
const newPassword = process.env.MAIL_TEST_HOLD === '1' ? 'Local-browser-fixture-only-2026!' : 'Changed!' + randomBytes(18).toString('hex');
const identities = ['Gheverhan', 'Toko Makmur', 'Fashion Store'].map((brand, i) => ({
  brand, origin: `https://localhost:${3411 + i}`, token: randomBytes(32).toString('hex'),
  seller: `seller${i}@example.test`, customer: `customer${i}@example.test`,
}));
const registry = parseRegistry(identities.map(t => ({ ...t, tokenHash: hashRelayValue(t.token), sellerEmails: [t.seller],
  customerEmails: [t.seller, t.customer] })), { requireCustomerAllowlist: true });
// Browser fixtures use the application's supported loopback HTTP origin. Only
// this in-memory fake-provider registry changes; production still requires HTTPS.
if (process.env.MAIL_TEST_HOLD === '1') for (const tenant of identities) {
  tenant.origin = tenant.origin.replace('https:', 'http:');
  registry.get(hashRelayValue(tenant.token)).origin = tenant.origin;
}
const quota = openQuota(':memory:');
const relay = createRelayServer({ registry: () => registry, reserve: quota.reserve, deliver: async message => messages.push(message) });
relay.listen(3419, '127.0.0.1'); await once(relay, 'listening');
async function command(args, env, input) {
  const child = spawn(process.execPath, args, { cwd: app, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  child.stdin.end(input);
  const [code] = await once(child, 'exit');
  if (code) throw Error('Isolated migration/bootstrap failed; inspect locally without printing credentials: exit ' + code);
}
async function waitFor(check) {
  for (let i = 0; i < 100; i++) { try { const value = await check(); if (value) return value; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw Error('Isolated service/email timeout');
}
try {
  for (const [i, tenant] of identities.entries()) {
    const name = `btos_mail_${'abc'[i]}_test`;
    // Never reset an existing database. Each run owns only the databases it creates.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created.push(name);
    const url = new URL(connection); url.pathname = '/' + name;
    const env = { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href, APP_ORIGIN: tenant.origin,
      JWT_SECRET: randomBytes(32).toString('hex'), STORE_MAIL_RELAY_TOKEN: tenant.token,
      MAIL_INTEGRATION_TEST: '1', NEXT_TELEMETRY_DISABLED: '1', STORAGE_LOCAL_ROOT: media.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/') };
    delete env.REGISTRATION_OTP_TEST_SINK; delete env.RESEND_API_KEY;
    await command(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
    await command(['node_modules/tsx/dist/cli.mjs', 'prisma/bootstrap.ts'], env,
      [tenant.brand, tenant.seller, password].join('\0'));
    const db = new PrismaClient({ datasources: { db: { url: url.href } } }); databases.push(db);
    const child = spawn(process.execPath, ['--import', new URL('./mail-preload.mjs', import.meta.url).href, 'node_modules/next/dist/bin/next',
      'start', '-H', '127.0.0.1', '-p', String(3411 + i)], { cwd: app, env, stdio: 'ignore' }); children.push(child);
    const http = `http://127.0.0.1:${3411 + i}`;
    await waitFor(async () => (await fetch(http + '/api/v1/ready')).ok);
    const request = async (path, body, cookie) => {
      const response = await fetch(http + path, { method: body ? 'POST' : 'GET', redirect: 'manual',
        headers: { Origin: tenant.origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    const submitForm = async (path, testId, fields) => {
      const html = await (await fetch(http + path)).text();
      const form = html.match(new RegExp(`<form[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)<\\/form>`))?.[1];
      assert.ok(form, 'SSR auth form exists');
      const decode = value => value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
      const body = new FormData();
      for (const input of form.matchAll(/<input\b[^>]*>/g)) {
        const attrs = Object.fromEntries([...input[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
        if (attrs.type === 'hidden' && attrs.name) body.append(attrs.name, attrs.value || '');
      }
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      const response = await fetch(http + path, { method: 'POST', redirect: 'manual', body,
        headers: { Origin: tenant.origin, 'X-Forwarded-Host': new URL(tenant.origin).host } });
      return { status: response.status, text: await response.text(), location: response.headers.get('location') };
    };
    const login = await request('/api/v1/auth/login', { identifier: tenant.seller, password }); assert.equal(login.status, 200);
    assert.equal((await request('/api/v1/admin/email-otp/test', {}, login.cookie)).status, 200);
    const reset = await request('/api/v1/auth/seller-password-reset', { action: 'request', email: tenant.seller }); assert.equal(reset.status, 202);
    const otp = await waitFor(() => messages.find(m => m.to[0] === tenant.seller && m.subject.startsWith('Kode Verifikasi')));
    assert.equal(otp.from, 'Buattokosendiri <otp@buattokosendiri.web.id>');
    const code = otp.text.match(/seller: (\d{6})/)[1];
    const verified = await request('/api/v1/auth/seller-password-reset', { action: 'verify', id: reset.data.id, code }); assert.equal(verified.status, 200);
    assert.equal((await request('/api/v1/auth/seller-password-reset', { action: 'verify', id: reset.data.id, code })).status, 400);
    const completed = await Promise.all(Array.from({ length: 2 }, () => request('/api/v1/auth/seller-password-reset', {
      action: 'complete', token: verified.data.token, password: newPassword, confirmation: newPassword })));
    assert.deepEqual(completed.map(x => x.status).sort(), [200, 400]);
    assert.equal((await request('/api/v1/admin/email-otp/test', {}, login.cookie)).status, 401);
    const registered = await request('/api/v1/auth/register', { name: 'Test Customer', email: tenant.customer, phone: `08123456789${i}`,
      password, confirmPassword: password, terms: true }); assert.equal(registered.status, 202);
    const registrationMail = await waitFor(() => messages.find(m => m.to[0] === tenant.customer));
    assert.equal(registrationMail.from, `${tenant.brand} <otp@buattokosendiri.web.id>`);
    const verify = { email: tenant.customer, challengeId: registered.data.data.challengeId, otp: registrationMail.text.match(/pendaftaran: (\d{6})/)[1] };
    assert.equal((await request('/api/v1/auth/register/verify', verify)).status, 201);
    assert.equal((await request('/api/v1/auth/register/verify', verify)).status, 400);
    const customerLogin = await request('/api/v1/auth/login', { identifier: tenant.customer, password });
    assert.equal(customerLogin.status, 200);
    assert.equal((await submitForm('/forgot-password', 'forgot-form', { email: tenant.customer })).status, 200);
    const resetMail = await waitFor(() => messages.find(m => m.to[0] === tenant.customer && m.subject.startsWith('Atur ulang')));
    assert.equal(resetMail.from, `${tenant.brand} <otp@buattokosendiri.web.id>`);
    const grant = resetMail.text.match(/token=([a-f0-9]{64})/)[1];
    const path = '/reset-password?token=' + grant;
    assert.equal((await submitForm(path, 'reset-form', { token: grant, password: newPassword })).status, 303);
    const replay = await submitForm(path, 'reset-form', { token: grant, password });
    assert.equal(replay.status, 200);
    assert.match(replay.text, /tidak valid|kedaluwarsa/);
    assert.equal((await request('/api/v1/auth/login', { identifier: tenant.customer, password })).status, 401);
    assert.equal((await request('/api/v1/auth/login', { identifier: tenant.customer, password: newPassword })).status, 200);
    assert.equal((await db.user.findUnique({ where: { email: tenant.customer } })).sessionVersion, 1);
    assert.equal((await request('/api/v1/auth/me', null, customerLogin.cookie)).status, 401);
    assert.equal(await db.user.count(), 2);
    assert.equal(await db.user.count({ where: { email: identities[(i + 1) % 3].seller } }), 0);
    console.log(JSON.stringify({ store: tenant.brand, databaseIsolation: 'PASS', sellerResetRace: 'PASS', sessionRevocation: 'PASS', customerOtp: 'PASS', customerResetAndReplay: 'PASS', senderIdentity: 'PASS', testEmail: 'PASS' }));
  }
  if (process.env.MAIL_TEST_HOLD === '1') {
    console.log('Disposable browser fixtures ready on loopback ports 3411-3413 for 180 seconds.');
    await new Promise(r => setTimeout(r, 180000));
  }
} finally {
  for (const child of children) { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } }
  for (const db of databases) await db.$disconnect();
  await new Promise(r => relay.close(r)); quota.close();
  for (const name of created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
  await admin.$disconnect();
  rmSync(media, { recursive: true, force: true });
}
