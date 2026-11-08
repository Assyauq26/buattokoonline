import { createHmac, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Persistent, secret-free delivery journal. Neither recipient nor OTP is stored.
// Provider retries retain the same Resend idempotency key, including after restart.
export function openDelivery(file, secret, { reserve, deliver, now = Date.now } = {}) {
  if (!secret || secret.length < 32) throw Error('missing_delivery_secret');
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=2000;
    CREATE TABLE IF NOT EXISTS delivery (
      fingerprint TEXT PRIMARY KEY, provider_key TEXT NOT NULL, state TEXT NOT NULL,
      lease INTEGER NOT NULL, expires INTEGER NOT NULL, quota_reserved INTEGER NOT NULL DEFAULT 0
    )`);
  async function dispatch(message, store, payload) {
    const fingerprint = createHmac('sha256', secret).update(JSON.stringify([
      store.tenantId, payload.purpose, payload.to.trim().toLowerCase(), payload.value,
      store.origin, store.brand, payload.requestId ||
        (['customer-test', 'seller-changed'].includes(payload.purpose) ? randomUUID() : ''),
    ])).digest('hex');
    const timestamp = now();
    let record;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM delivery WHERE expires <= ?').run(timestamp);
      record = db.prepare('SELECT * FROM delivery WHERE fingerprint=?').get(fingerprint);
      if (record?.state === 'sent') { db.exec('COMMIT'); return 202; }
      if (record && record.lease > timestamp) { db.exec('COMMIT'); return 503; }
      if (!record) {
        // Keep retries strictly shorter than Resend's 24-hour idempotency window.
        db.prepare('INSERT INTO delivery VALUES (?, ?, ?, ?, ?, 0)').run(fingerprint, randomUUID(), 'pending', timestamp + 20000, timestamp + 23 * 3600000);
        record = db.prepare('SELECT * FROM delivery WHERE fingerprint=?').get(fingerprint);
      } else db.prepare('UPDATE delivery SET lease=? WHERE fingerprint=?').run(timestamp + 20000, fingerprint);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (!record.quota_reserved) {
      if (!reserve(store.tenantId, payload.to.trim().toLowerCase(), payload.purpose)) {
        db.prepare('DELETE FROM delivery WHERE fingerprint=?').run(fingerprint);
        return 429;
      }
      db.prepare('UPDATE delivery SET quota_reserved=1 WHERE fingerprint=?').run(fingerprint);
    }
    try {
      await deliver(message, record.provider_key);
      db.prepare("UPDATE delivery SET state='sent',lease=0 WHERE fingerprint=?").run(fingerprint);
      return 202;
    } catch {
      // Back off instead of hammering a throttled provider. The client can retry;
      // no unattended retry queue holds plaintext authentication material.
      db.prepare('UPDATE delivery SET lease=? WHERE fingerprint=?').run(now() + 30000, fingerprint);
      return 503;
    }
  }
  return { dispatch, close: () => db.close(), healthy: () => Boolean(db.prepare('SELECT 1 AS ok').get().ok) };
}
