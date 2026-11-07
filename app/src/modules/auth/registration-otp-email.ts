import { HttpError } from "@/lib/response";
import { storeOrigin } from "@/lib/store-config";
import { deliverResend, mailSender, renderOtpMail, sanitizeMailBrand } from "./mail-contract.mjs";

export type MailPurpose = "customer-registration" | "customer-reset" | "seller-reset" | "seller-changed" | "customer-test";
const relayUrl = "https://buattokosendiri.web.id/api/platform/store-mail";
const resendUrl = "https://api.resend.com/emails";
const unavailable = () => new HttpError("Layanan email belum tersedia. Coba lagi nanti.", 503);

export function registrationMailConfig() {
  const sink = process.env.REGISTRATION_OTP_TEST_SINK;
  if (sink) {
    try {
      const db = new URL(process.env.DATABASE_URL ?? "");
      const url = new URL(sink);
      if (process.env.STORE_ISOLATED_TESTS === "1" && !process.env.VERCEL_ENV &&
          !process.env.NETLIFY && ["localhost", "127.0.0.1"].includes(db.hostname) &&
          db.pathname === "/store_sprint1_test" && url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/emails" &&
          !url.username && !url.password && !url.search && !url.hash) {
        return { mode: "direct", endpoint: url.href, key: "isolated-test" } as const;
      }
    } catch { /* Reject unsafe overrides. */ }
    throw unavailable();
  }
  const relayToken = process.env.STORE_MAIL_RELAY_TOKEN?.trim();
  if (relayToken) {
    if (!/^[a-f0-9]{64}$/.test(relayToken)) throw unavailable();
    return { mode: "relay", endpoint: relayUrl, key: relayToken } as const;
  }
  const key = process.env.RESEND_API_KEY?.trim();
  if (process.env.STORE_MAIL_MODE === "operator-direct" && key)
    return { mode: "direct", endpoint: resendUrl, key } as const;
  throw unavailable();
}

export async function mailBrand() {
  const { readPublishedUncached } = await import("@/modules/appearance/service");
  return sanitizeMailBrand((await readPublishedUncached()).config.identity.name);
}

export async function sendStoreMail(
  purpose: MailPurpose, to: string, value: string,
  config = registrationMailConfig(),
) {
  const store = { origin: storeOrigin(), brand: purpose.startsWith("customer-") ? await mailBrand() : "" };
  try {
    if (config.mode === "direct") {
      await deliverResend(config.endpoint, config.key, renderOtpMail({ purpose, to, value }, store));
      return;
    }
    const response = await fetch(config.endpoint, {
      method: "POST", headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, to, value, ...store }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw unavailable();
  } catch {
    throw unavailable();
  }
}

export function sendRegistrationOtpEmail(email: string, code: string, config = registrationMailConfig()) {
  return sendStoreMail("customer-registration", email, code, config);
}

export async function storeMailStatus() {
  let configured = false;
  try { registrationMailConfig(); storeOrigin(); configured = true; }
  catch { /* Expose configuration status, never credentials. */ }
  const brand = await mailBrand();
  return { configured, brand, sender: mailSender(brand) };
}
