import { DatabaseSync } from "node:sqlite";
import { hashRelayValue } from "./relay.mjs";

export function openQuota(file, { daily = 50, monthly = 1500, tenantDaily = 10, now = Date.now } = {}) {
  if (![daily, monthly, tenantDaily].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('invalid_quota');
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 2000; CREATE TABLE IF NOT EXISTS quota (bucket TEXT PRIMARY KEY, used INTEGER NOT NULL, expires INTEGER NOT NULL)");
  const cleanup = db.prepare("DELETE FROM quota WHERE expires <= ?");
  const increment = db.prepare(`INSERT INTO quota VALUES (?,1,?) ON CONFLICT(bucket)
    DO UPDATE SET used=used+1 WHERE used < ? RETURNING used`);

  function reserve(origin, recipient, purpose) {
    const timestamp = now(), minute = Math.floor(timestamp / 60_000), hour = Math.floor(minute / 60), day = Math.floor(hour / 24);
    const date = new Date(timestamp), month = date.toISOString().slice(0, 7);
    const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    const scopes = [
      ['day:' + day, (day + 1) * 86400000, daily],
      ['month:' + month, monthEnd, monthly],
      ['tenant-day:' + hashRelayValue(origin) + ':' + day, (day + 1) * 86400000, tenantDaily],
      ["global:" + minute, (minute + 1) * 60_000, 40],
      ["global-hour:" + hour, (hour + 1) * 3_600_000, 150],
      ["store:" + hashRelayValue(origin) + ":" + hour, (hour + 1) * 3_600_000, 30],
      ["recipient:" + hashRelayValue(origin + ':' + recipient) + ":" + hour, (hour + 1) * 3_600_000, 10],
    ];
    if (purpose === "customer-test") scopes.push(
      ["test:" + hashRelayValue(origin) + ":" + hour, (hour + 1) * 3_600_000, 3],
      ['global-test:' + day, (day + 1) * 86400000, Math.max(1, Math.floor(daily * .1))],
    );
    if (!purpose.startsWith('seller-')) scopes.push(
      ['noncritical:' + day, (day + 1) * 86400000, Math.max(1, Math.floor(daily * .8))],
      ['tenant-noncritical:' + hashRelayValue(origin) + ':' + day, (day + 1) * 86400000, Math.max(1, tenantDaily - 2)],
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      cleanup.run(timestamp);
      if (!scopes.every(([bucket, expires, limit]) => increment.get(bucket, expires, limit))) {
        db.exec("ROLLBACK");
        return false;
      }
      db.exec("COMMIT");
      return true;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function usage() {
    const timestamp = now(), day = Math.floor(timestamp / 86400000), month = new Date(timestamp).toISOString().slice(0, 7);
    const read = bucket => Number(db.prepare('SELECT used FROM quota WHERE bucket=?').get(bucket)?.used || 0);
    return { day: read('day:' + day), dayLimit: daily, month: read('month:' + month), monthLimit: monthly };
  }
  return { reserve, usage, healthy: () => Boolean(db.prepare('SELECT 1 AS ok').get().ok), close: () => db.close() };
}
