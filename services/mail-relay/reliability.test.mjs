import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDelivery } from './delivery.mjs';
import { openQuota } from './quota.mjs';

test('persistent delivery: concurrency, restart, timeout, retry idempotency', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'btos-mail-test-'));
  let clock = Date.now(), sends = 0, reservations = 0, failed = true;
  const keys = [];
  const options = { now: () => clock, reserve: () => { reservations++; return true; },
    deliver: async (_mail, key) => { sends++; keys.push(key); await new Promise(r => setTimeout(r, 10)); if (failed) throw Error('timeout'); } };
  const file = join(dir, 'mail.sqlite');
  let ledger = openDelivery(file, 'test-secret-'.repeat(4), options);
  const store = { tenantId: 'a', origin: 'https://a.example.test', brand: 'A' };
  const payload = { purpose: 'seller-reset', to: 'a@example.test', value: '123456' };
  try {
    assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => ledger.dispatch({}, store, payload))), Array(10).fill(503));
    assert.equal(sends, 1);
    assert.equal(reservations, 1);
    ledger.close();
    ledger = openDelivery(file, 'test-secret-'.repeat(4), options);
    clock += 31000; failed = false;
    assert.equal(await ledger.dispatch({}, store, payload), 202);
    assert.equal(keys[0], keys[1]);
    assert.equal(await ledger.dispatch({}, store, payload), 202);
    assert.equal(sends, 2);
    assert.equal(reservations, 1);
    assert.equal(await ledger.dispatch({}, { ...store, tenantId: 'b' }, payload), 202);
    assert.equal(sends, 3);
  } finally { ledger.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('quota partition: tenant isolation, fair daily cap and authentication reserve', () => {
  const quota = openQuota(':memory:');
  try {
    for (let i = 0; i < 8; i++) assert.equal(quota.reserve('a', `user${i}@example.test`, 'customer-registration'), true);
    assert.equal(quota.reserve('a', 'blocked@example.test', 'customer-registration'), false);
    for (let i = 0; i < 2; i++) assert.equal(quota.reserve('a', `owner${i}@example.test`, 'seller-reset'), true);
    assert.equal(quota.reserve('a', 'another@example.test', 'seller-reset'), false);
    assert.equal(quota.reserve('b', 'user0@example.test', 'seller-reset'), true);
    for (let i = 0; i < 5; i++) assert.equal(quota.reserve('test-' + i, 'owner@example.test', 'customer-test'), true);
    assert.equal(quota.reserve('test-6', 'owner@example.test', 'customer-test'), false);
    assert.equal(quota.reserve('c', 'owner@example.test', 'seller-reset'), true);
  } finally { quota.close(); }
});

test('closed quota storage fails closed', () => {
  const quota = openQuota(':memory:'); quota.close();
  assert.throws(() => quota.reserve('a', 'a@example.test', 'seller-reset'));
  assert.throws(() => quota.healthy());
});

test('global exhaustion survives restart and recovers next UTC day', () => {
  const dir = mkdtempSync(join(tmpdir(), 'btos-quota-test-'));
  const file = join(dir, 'quota.sqlite');
  let clock = Date.UTC(2026, 10, 7);
  const options = { daily: 4, monthly: 20, tenantDaily: 2, now: () => clock };
  let quota = openQuota(file, options);
  try {
    for (const tenant of ['a', 'b']) for (let i = 0; i < 2; i++)
      assert.equal(quota.reserve(tenant, `seller${i}@example.test`, 'seller-reset'), true);
    assert.equal(quota.reserve('c', 'owner@example.test', 'seller-reset'), false);
    quota.close(); quota = openQuota(file, options);
    assert.equal(quota.usage().day, 4);
    assert.equal(quota.reserve('c', 'owner@example.test', 'seller-reset'), false);
    clock += 86400000;
    assert.equal(quota.reserve('c', 'owner@example.test', 'seller-reset'), true);
    assert.equal(quota.usage().month, 5);
  } finally { quota.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('separate password changes are not silently deduplicated', async () => {
  let sends = 0;
  const ledger = openDelivery(':memory:', 'synthetic-test-key'.repeat(3), {
    reserve: () => true, deliver: async () => sends++,
  });
  const store = { tenantId: 'a', origin: 'https://a.example.test', brand: 'A' };
  try {
    const payload = { purpose: 'seller-changed', to: 'a@example.test', value: '', requestId: 'a'.repeat(36) };
    await ledger.dispatch({}, store, payload);
    await ledger.dispatch({}, store, payload);
    await ledger.dispatch({}, store, { ...payload, requestId: 'b'.repeat(36) });
    assert.equal(sends, 2);
  } finally { ledger.close(); }
});
