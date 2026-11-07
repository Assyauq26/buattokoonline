import { DatabaseSync } from "node:sqlite";
import { hashRelayValue } from "./relay.mjs";

export function openQuota(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 2000; CREATE TABLE IF NOT EXISTS quota (bucket TEXT PRIMARY KEY, used INTEGER NOT NULL, expires INTEGER NOT NULL)");
  const cleanup = db.prepare("DELETE FROM quota WHERE expires <= ?");
  const increment = db.prepare(`INSERT INTO quota VALUES (?,1,?) ON CONFLICT(bucket)
    DO UPDATE SET used=used+1 WHERE used < ? RETURNING used`);

  function reserve(origin, recipient, purpose) {
    const minute = Math.floor(Date.now() / 60_000), hour = Math.floor(minute / 60);
    const scopes = [
      ["global:" + minute, (minute + 1) * 60_000, 40],
      ["global-hour:" + hour, (hour + 1) * 3_600_000, 150],
      ["store:" + hashRelayValue(origin) + ":" + hour, (hour + 1) * 3_600_000, 30],
      ["recipient:" + hashRelayValue(recipient) + ":" + hour, (hour + 1) * 3_600_000, 10],
    ];
    if (purpose === "customer-test") scopes.push(["test:" + hashRelayValue(origin) + ":" + hour, (hour + 1) * 3_600_000, 3]);
    db.exec("BEGIN IMMEDIATE");
    try {
      cleanup.run(Date.now());
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

  return { reserve, close: () => db.close() };
}
