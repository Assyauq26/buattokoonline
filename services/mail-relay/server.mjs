import { createRelayServer } from "./http.mjs";
import { readFileSync } from "node:fs";
import { openQuota } from "./quota.mjs";
import { deliverResend } from "../../app/src/modules/auth/mail-contract.mjs";
import { parseRegistry } from "./relay.mjs";

const { RESEND_API_KEY, MAIL_RELAY_REGISTRY, MAIL_RELAY_DB } = process.env;
if (!RESEND_API_KEY?.trim() || !MAIL_RELAY_REGISTRY || !MAIL_RELAY_DB)
  throw new Error("mail_relay_configuration_missing");
process.umask(0o077);
const registry = () => parseRegistry(JSON.parse(readFileSync(MAIL_RELAY_REGISTRY, "utf8")));
registry();
const quota = openQuota(MAIL_RELAY_DB);
const server = createRelayServer({
  registry, reserve: quota.reserve,
  deliver: message => deliverResend("https://api.resend.com/emails", RESEND_API_KEY, message),
});
const bind = process.env.MAIL_RELAY_BIND ?? "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(bind)) throw new Error("invalid_mail_relay_bind");
server.listen(Number(process.env.MAIL_RELAY_PORT ?? 8092), bind);
