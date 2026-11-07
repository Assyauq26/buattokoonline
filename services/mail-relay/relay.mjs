import { createHash } from "node:crypto";
import { renderOtpMail, sanitizeMailBrand } from "../../app/src/modules/auth/mail-contract.mjs";

export const hashRelayValue = value => createHash("sha256").update(value).digest("hex");

const validEmails = entries => Array.isArray(entries) && entries.every(
  email => typeof email === "string" && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email.trim()),
);
const normalizedEmails = entries => new Set(entries.map(email => email.trim().toLowerCase()));

export function parseRegistry(entries, { requireCustomerAllowlist = false } = {}) {
  if (!Array.isArray(entries)) throw new Error("invalid_registry");
  const stores = new Map();
  const origins = new Set();
  for (const row of entries) {
    const origin = new URL(row.origin);
    if (origin.protocol !== "https:" || origin.origin !== row.origin ||
        typeof row.brand !== "string" || !row.brand.trim() ||
        !/^[a-f0-9]{64}$/.test(row.tokenHash) || stores.has(row.tokenHash) || origins.has(row.origin) ||
        !validEmails(row.sellerEmails) ||
        ((requireCustomerAllowlist || row.customerEmails !== undefined) && !validEmails(row.customerEmails)))
      throw new Error("invalid_registry");
    origins.add(row.origin);
    stores.set(row.tokenHash, { origin: row.origin, brand: sanitizeMailBrand(row.brand),
      sellerEmails: normalizedEmails(row.sellerEmails),
      customerEmails: row.customerEmails === undefined ? null : normalizedEmails(row.customerEmails) });
  }
  return stores;
}

/** Authorize by a store-scoped token and registry identity before touching quotas or mail. */
export async function relayMail({ authorization, payload }, { stores, reserve, deliver }) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization || "");
  const store = match && stores.get(hashRelayValue(match[1]));
  if (!store) return 401;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some(key => !["purpose", "to", "value", "origin", "brand"].includes(key)))
    return 400;
  if (payload.origin !== store.origin) return 403;
  if (typeof payload.purpose !== "string" || typeof payload.to !== "string") return 400;
  const to = payload.to.trim().toLowerCase();
  if ((payload.purpose.startsWith("seller-") || payload.purpose === "customer-test") && !store.sellerEmails.has(to))
    return 403;
  if (payload.purpose.startsWith("customer-") && store.customerEmails && !store.customerEmails.has(to))
    return 403;
  if (payload.purpose.startsWith("customer-") && payload.brand !== store.brand) return 409;
  let message;
  try { message = renderOtpMail({ ...payload, to }, store); }
  catch { return 400; }
  if (!reserve(store.origin, to, payload.purpose)) return 429;
  try { await deliver(message); }
  catch { return 503; }
  return 202;
}
