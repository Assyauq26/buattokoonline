import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import type { AuthUser } from "@/lib/auth/session";
import { writeAudit } from "@/modules/audit/audit.service";
import type { Prisma } from "@prisma/client";
import { assertJntScope, installationBinding, localJntSettings, mayManageLocalJnt, sellerConfigurationSchema } from "./seller-config";

export const jntEnvironment = z.enum(["sandbox", "production"]);
export type JntEnvironment = z.infer<typeof jntEnvironment>;

const urls = z.object({
  order: z.string().url().max(350),
  tariff: z.string().url().max(350),
  tracking: z.string().url().max(350),
  cancellation: z.string().url().max(350),
}).strict();
const credentials = z.object({
  orderUsername: z.string().trim().min(1).max(120),
  orderApiKey: z.string().trim().min(1).max(200),
  orderKey: z.string().min(1).max(300),
  tariffCustomer: z.string().trim().min(1).max(120),
  tariffKey: z.string().min(1).max(300),
  trackingUsername: z.string().trim().min(1).max(120),
  trackingPassword: z.string().min(1).max(300),
}).strict();
export const jntConfigSchema = z.object({ endpoints: urls, credentials, seller: sellerConfigurationSchema.optional() }).strict();
export type JntConfig = z.infer<typeof jntConfigSchema>;
export type JntCredentialKey = keyof JntConfig["credentials"];
export const credentialKeys = [
  "orderUsername", "orderApiKey", "orderKey", "tariffCustomer", "tariffKey",
  "trackingUsername", "trackingPassword",
] as const;

export const jntSettingsInput = z.object({
  environment: jntEnvironment,
  enabled: z.boolean(),
  endpoints: urls,
  // Blank means preserve existing secret, never erase it by accident.
  credentials: z.object({
    orderUsername: z.string().max(120).optional(),
    orderApiKey: z.string().max(200).optional(),
    orderKey: z.string().max(300).optional(),
    tariffCustomer: z.string().max(120).optional(),
    tariffKey: z.string().max(300).optional(),
    trackingUsername: z.string().max(120).optional(),
    trackingPassword: z.string().max(300).optional(),
  }).strict(),
  seller: sellerConfigurationSchema.optional(),
}).strict();

const validPaths: Record<keyof JntConfig["endpoints"], string> = {
  order: "/jts-idn-ecommerce-api/api/order/create",
  cancellation: "/jts-idn-ecommerce-api/api/order/cancel",
  tariff: "/jandt_track/inquiry.action",
  tracking: "/jandt_track/track/trackAction!tracking.action",
};
function validateEndpoint(kind: keyof JntConfig["endpoints"], raw: string, env: JntEnvironment) {
  let u: URL;
  try { u = new URL(raw); }
  catch { throw new HttpError("URL endpoint J&T tidak valid", 422); }
  const hosts: Record<JntEnvironment, Record<keyof JntConfig["endpoints"], string>> = {
    sandbox: {
      order: "demo-ecommerce.inuat-jntexpress.id",
      cancellation: "demo-ecommerce.inuat-jntexpress.id",
      tariff: "demo-general.inuat-jntexpress.id",
      tracking: "demo-general.inuat-jntexpress.id",
    },
    production: {
      order: "api.jet.co.id",
      cancellation: "api.jet.co.id",
      tariff: "partner-track.jet.co.id",
      tracking: "partner-track.jet.co.id",
    },
  };
  // The seller's verified production Tracking contract may use J&T's
  // older order-web host/path. Keep this as an exact allowlisted pair;
  // never accept arbitrary hostnames, paths, redirects or URL parameters.
  const approvedProductionTracking = kind === "tracking" && env === "production" &&
    u.hostname === "secure-jk.jet.co.id" &&
    u.pathname === "/jandt-order-web/track/trackAction!tracking.action";
  const approvedDefault = u.hostname === hosts[env][kind] && u.pathname === validPaths[kind];
  // Strict host/path allowlist: an operator's input must never become an SSRF primitive.
  if (u.protocol !== "https:" || (!approvedDefault && !approvedProductionTracking) ||
      u.search || u.hash || u.port || u.username || u.password) {
    throw new HttpError("Endpoint tidak sesuai allowlist resmi J&T untuk environment ini", 422);
  }
}
function encryptionKey() {
  const raw = process.env.JNT_INTEGRATION_ENCRYPTION_KEY || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    throw new HttpError("Kunci enkripsi integrasi J&T belum dikonfigurasi di server", 503);
  }
  return key;
}
function encrypt(value: JntConfig, environment: JntEnvironment) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  if (localJntSettings()) cipher.setAAD(installationBinding(environment));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [localJntSettings() ? "v2" : "v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}
function decrypt(value: string, environment: JntEnvironment): JntConfig {
  try {
    const [version, nonce, authTag, data, extra] = value.split(":");
    if (version !== (localJntSettings() ? "v2" : "v1") || !nonce || !authTag || !data || extra) throw new Error("Malformed ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64"));
    if (version === "v2") decipher.setAAD(installationBinding(environment));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    return jntConfigSchema.parse(JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(data, "base64")), decipher.final(),
    ]).toString("utf8")));
  } catch {
    throw new HttpError("Konfigurasi J&T tidak dapat didekripsi; rotasi kunci memerlukan migrasi aman", 503);
  }
}
export function isJntSettingsAdministrator(user: AuthUser | null) {
  return mayManageLocalJnt(user);
}
export async function readJntSettings(environment: JntEnvironment, db: Prisma.TransactionClient = prisma) {
  assertJntScope();
  const row = await db.jntIntegration.findUnique({ where: { environment } });
  return row ? { config: decrypt(row.encryptedConfig, environment), enabled: row.enabled, updatedAt: row.updatedAt } : null;
}
export async function readJntPublicStatus(environment: JntEnvironment) {
  const state = await readJntSettings(environment);
  return {
    environment,
    configured: !!state,
    enabled: !!state?.enabled,
    updatedAt: state?.updatedAt.toISOString() ?? null,
    endpoints: state?.config.endpoints ?? null,
    credentialSet: Object.fromEntries(credentialKeys.map(key => [key, !!state?.config.credentials[key]])),
    ...(localJntSettings() ? { scope: "local_store", seller: state?.config.seller ?? null,
      connectionStatus: "NOT_TESTED", shippingReady: false } : {}),
  };
}
export async function saveJntSettings(input: z.infer<typeof jntSettingsInput>, actorId: string) {
  assertJntScope();
  if (localJntSettings()) {
    installationBinding(input.environment);
    if (!input.seller) throw new HttpError("Lengkapi informasi gudang pengirim", 422);
  } else if (input.seller) throw new HttpError("Konfigurasi seller memerlukan mode toko lokal", 422);
  for (const kind of Object.keys(validPaths) as Array<keyof JntConfig["endpoints"]>) {
    validateEndpoint(kind, input.endpoints[kind], input.environment);
  }
  // Secrets are encrypted before DB persistence; never return them, even to the owner.
  const row = await prisma.$transaction(async tx => {
    // Serialize even the first insert so blank updates cannot undo a concurrent rotation.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"jnt-settings:" + input.environment}))::text`;
    const previous = await readJntSettings(input.environment, tx);
    const merged: Record<string, string> = {};
    for (const key of credentialKeys) {
      merged[key] = input.credentials[key] || previous?.config.credentials[key] || "";
    }
    const config = jntConfigSchema.safeParse({ endpoints: input.endpoints, credentials: merged, ...(input.seller ? { seller: input.seller } : {}) });
    if (!config.success) throw new HttpError("Lengkapi seluruh kredensial J&T sebelum menyimpan", 422);
    const saved = await tx.jntIntegration.upsert({
    where: { environment: input.environment },
    create: { environment: input.environment, enabled: input.enabled, encryptedConfig: encrypt(config.data, input.environment), updatedBy: actorId },
    update: { enabled: input.enabled, encryptedConfig: encrypt(config.data, input.environment), updatedBy: actorId },
    });
    await writeAudit({ userId: actorId, action: "jnt.integration.updated",
      entity: "JntIntegration", entityId: input.environment,
      meta: { environment: input.environment, enabled: input.enabled,
        ...(localJntSettings() ? { scope: "local_store", credentialFieldsChanged: credentialKeys.filter(k => !!input.credentials[k]) } : {}) } }, tx);
    return saved;
  });
  return { environment: input.environment, configured: true, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
}
export async function activeJntConfig() {
  assertJntScope();
  const environment = jntEnvironment.safeParse(process.env.JNT_API_ENV);
  if (!environment.success) throw new HttpError("Environment J&T belum dipilih oleh operator server", 503);
  // An owner may prepare credentials without authorizing any live carrier request.
  if (environment.data === "production" && process.env.JNT_PRODUCTION_API_APPROVED !== "yes") {
    throw new HttpError("Operasi API J&T Production belum disetujui operator server", 503);
  }
  const settings = await readJntSettings(environment.data);
  if (!settings?.enabled) throw new HttpError("Integrasi J&T belum diaktifkan", 503);
  if (!settings.config.seller || !settings.config.seller.services.some(s => s.code === "EZ" && Date.parse(s.validUntil) > Date.now())) throw new HttpError("Layanan EZ toko belum dikonfigurasi atau kedaluwarsa", 503);
  return settings.config;
}
