import { createRelayServer } from "./http.mjs";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { openQuota } from "./quota.mjs";
import { deliverResend } from "../../app/src/modules/auth/mail-contract.mjs";
import { parseRegistry } from "./relay.mjs";
import { remoteRegistry } from "./registry.mjs";
import { createHmac } from 'node:crypto';
import { openDelivery } from './delivery.mjs';

const { RESEND_API_KEY, MAIL_RELAY_REGISTRY, MAIL_RELAY_DB } = process.env;
if (!RESEND_API_KEY?.trim() || !(MAIL_RELAY_REGISTRY || process.env.MAIL_REGISTRY_URL) || !MAIL_RELAY_DB)
  throw new Error("mail_relay_configuration_missing");
process.umask(0o077);
const strict = process.env.MAIL_RELAY_REQUIRE_CUSTOMER_ALLOWLIST === "1";
const recipients = process.env.MAIL_TEST_RECIPIENTS?.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
if (strict && process.env.MAIL_REGISTRY_URL && !recipients?.length) throw Error('missing_customer_allowlist');
const registry = process.env.MAIL_REGISTRY_URL ? remoteRegistry(process.env.MAIL_REGISTRY_URL, process.env.MAIL_CONTROL_SECRET, {
  requireCustomerAllowlist: strict, recipients,
}) : () => parseRegistry(JSON.parse(readFileSync(MAIL_RELAY_REGISTRY, "utf8")), {
  requireCustomerAllowlist: process.env.MAIL_RELAY_REQUIRE_CUSTOMER_ALLOWLIST === "1",
});
if (!process.env.MAIL_REGISTRY_URL) registry();
const quota = openQuota(MAIL_RELAY_DB);
const delivery = openDelivery(MAIL_RELAY_DB, process.env.MAIL_CONTROL_SECRET || process.env.MAIL_IDEMPOTENCY_SECRET, {
  minInterval: 250,
  reserve: quota.reserve,
  deliver: async (message, key) => {
    const id = await deliverResend('https://api.resend.com/emails', RESEND_API_KEY, message, key);
    console.info(JSON.stringify({ event: 'mail_relay.accepted', providerId: id }));
  },
});
const server = createRelayServer({
  registry, reserve: quota.reserve, dispatch: delivery.dispatch, ready: async () => {
    if (!quota.healthy() || !delivery.healthy()) return false;
    await registry('0'.repeat(64)); // Authenticated control-plane liveness, not a send.
    return true;
  },
  receipt: process.env.MAIL_REGISTRY_URL ? tenant => {
    const expires = Date.now() + 120_000;
    return { expires, signature: createHmac('sha256', process.env.MAIL_CONTROL_SECRET)
      .update(`mail-ready-v1:${tenant.tenantId}:${tenant.generation}:${expires}`).digest('hex') };
  } : undefined,
  deliver: message => deliverResend("https://api.resend.com/emails", RESEND_API_KEY, message),
});
const bind = process.env.MAIL_RELAY_BIND ?? "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(bind)) throw new Error("invalid_mail_relay_bind");
server.maxConnections = 64;
server.listen(Number(process.env.MAIL_RELAY_PORT ?? 8092), bind);
const monitor = setInterval(() => {
  try {
    const usage = quota.usage();
    const nearLimit = usage.day >= usage.dayLimit * .8 || usage.month >= usage.monthLimit * .8;
    const status = { checkedAt: new Date().toISOString(), ...usage, nearLimit,
      pending: delivery.pending(), beta: true };
    writeFileSync(MAIL_RELAY_DB + '.status.new', JSON.stringify(status), { mode: 0o600 });
    renameSync(MAIL_RELAY_DB + '.status.new', MAIL_RELAY_DB + '.status.json');
    if (nearLimit || status.pending > 0) console.warn(JSON.stringify({ event: 'mail_relay.operator_attention', ...status }));
    console.info(JSON.stringify({ event: 'mail_relay.usage', ...usage,
      nearLimit }));
  } catch { console.error('mail_relay.monitor_unavailable'); }
}, 60000);
monitor.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  clearInterval(monitor);
  server.close(() => { delivery.close(); quota.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 20_000).unref();
});
