import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import type { AuthUser } from "@/lib/auth/session";
import { writeAudit } from "@/modules/audit/audit.service";
import type { Prisma } from "@prisma/client";
import { assertJntScope, installationBinding, localJntSettings, mayManageLocalJnt, sellerConfigurationSchema, sellerDraftSchema } from "./seller-config";
import { mappedWarehouse } from "./verified-mapping";
import { validTariffProof } from "./tariff-proof";

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
  cancellationUsername: z.string().trim().min(1).max(120).optional(),
  cancellationApiKey: z.string().trim().min(1).max(200).optional(),
  cancellationKey: z.string().min(1).max(300).optional(),
}).strict();
export const jntConfigSchema = z.object({ endpoints: urls, credentials, seller: sellerConfigurationSchema.optional(), sharedCancellation: z.boolean().optional() }).strict();
export type JntConfig = z.infer<typeof jntConfigSchema>;
export type JntCredentialKey = keyof JntConfig["credentials"];
export const credentialKeys = [
  "orderUsername", "orderApiKey", "orderKey", "tariffCustomer", "tariffKey",
  "trackingUsername", "trackingPassword", "cancellationUsername", "cancellationApiKey", "cancellationKey",
] as const;

export const jntSettingsInput = z.object({
  environment: jntEnvironment,
  sharedCancellation: z.boolean(),
  tariffProof: z.string().max(100).optional(),
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
    cancellationUsername: z.string().max(120).optional(),
    cancellationApiKey: z.string().max(200).optional(),
    cancellationKey: z.string().max(300).optional(),
  }).strict(),
  seller: sellerDraftSchema,
}).strict();

const validPaths: Record<keyof JntConfig["endpoints"], string> = {
  order: "/jts-idn-ecommerce-api/api/order/create",
  cancellation: "/jts-idn-ecommerce-api/api/order/cancel",
  tariff: "/jandt_track/inquiry.action",
  tracking: "/jandt_track/track/trackAction!tracking.action",
};
export function validateEndpoint(kind: keyof JntConfig["endpoints"], raw: string, env: JntEnvironment) {
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
  let reviewed: unknown;
  try { reviewed = JSON.parse(process.env.JNT_REVIEWED_ENDPOINTS_JSON || "{}")?.[env]?.[kind]; }
  catch { throw new HttpError("Daftar endpoint J&T server tidak valid", 503); }
  // An operator can pin a different URL only after verifying it directly with J&T.
  if (u.protocol !== "https:" || (!approvedDefault && !approvedProductionTracking && reviewed !== u.href) ||
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
export function decryptJntConfig(value: string, environment: JntEnvironment): JntConfig {
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
  return row ? { config: decryptJntConfig(row.encryptedConfig, environment), enabled: row.enabled, updatedAt: row.updatedAt, tariffProof: row.tariffProof } : null;
}
export function requireCarrierEnvironment(environment: JntEnvironment) {
  if (process.env.JNT_API_ENV !== environment ||
      (environment === "production" && process.env.JNT_PRODUCTION_API_APPROVED !== "yes")) {
    throw new HttpError("Environment J&T belum disetujui operator server", 503);
  }
}

export function requireProbeEnvironment(environment: JntEnvironment) {
  if (environment === "sandbox" && process.env.JNT_SANDBOX_API_APPROVED === "yes") return;
  requireCarrierEnvironment(environment);
}

export function requireEz(config: JntConfig) {
  if (!config.seller?.services.some(service => service.code === "EZ" && Date.parse(service.validUntil) > Date.now())) {
    throw new HttpError("Persetujuan layanan EZ belum diisi atau telah kedaluwarsa", 422);
  }
}

export function validateJntConfig(config: JntConfig, environment: JntEnvironment) {
  for (const kind of Object.keys(validPaths) as Array<keyof JntConfig["endpoints"]>) {
    validateEndpoint(kind, config.endpoints[kind], environment);
  }
  if (config.sharedCancellation === false && (!config.credentials.cancellationUsername ||
      !config.credentials.cancellationApiKey || !config.credentials.cancellationKey)) {
    throw new HttpError("Lengkapi kredensial Cancellation atau pilih kredensial Order yang disetujui J&T", 422);
  }
}

export async function resolveJntDraft(input: z.infer<typeof jntSettingsInput>, db: Prisma.TransactionClient = prisma) {
  const previous = await readJntSettings(input.environment, db);
  const merged: Partial<Record<JntCredentialKey, string>> = {};
  for (const key of credentialKeys) {
    const candidate = input.credentials[key];
    if (candidate && /^(?:[*•●]+|\[?(?:masked|redacted)\]?)$/i.test(candidate.trim())) {
      throw new HttpError("Kosongkan field untuk mempertahankan kredensial tersimpan", 422);
    }
    const value = candidate || previous?.config.credentials[key];
    if (value) merged[key] = value;
  }
  const { version, ...origin } = await mappedWarehouse(input.seller.warehouse.districtCode, undefined, db);
  const config = jntConfigSchema.safeParse({
    endpoints: input.endpoints, credentials: merged, sharedCancellation: input.sharedCancellation,
    seller: { warehouse: { ...input.seller.warehouse, ...origin }, services: input.seller.services },
  });
  if (!config.success) throw new HttpError("Lengkapi seluruh kredensial J&T", 422);
  validateJntConfig(config.data, input.environment);
  return { config: config.data, version, previousProof: previous?.tariffProof };
}

export async function readJntPublicStatus(environment: JntEnvironment) {
  const state = await readJntSettings(environment);
  return {
    environment, configured: !!state, enabled: !!state?.enabled, updatedAt: state?.updatedAt.toISOString() ?? null,
    endpoints: state?.config.endpoints ?? null,
    seller: state?.config.seller ?? null,
    sharedCancellation: state?.config.sharedCancellation ?? true,
    credentialSet: Object.fromEntries(credentialKeys.map(key => [key, !!state?.config.credentials[key]])),
  };
}

export async function saveJntSettings(input: z.infer<typeof jntSettingsInput>, actorId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ShippingSettings" WHERE id = 1 FOR SHARE`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"jnt-settings:" + input.environment}))::text`;
    const { config, version, previousProof } = await resolveJntDraft(input, tx);
    const proof = input.tariffProof || previousProof;
    if (input.tariffProof && !validTariffProof(input.tariffProof, config, input.environment, version)) {
      throw new HttpError("Hasil uji tarif telah kedaluwarsa atau input berubah. Uji kembali.", 409);
    }
    const tariffProof = validTariffProof(proof, config, input.environment, version) ? proof : null;
    const data = { encryptedConfig: encrypt(config, input.environment), updatedBy: actorId, tariffProof };
    // Preserve the legacy authorization flag for historical orders.
    await tx.jntIntegration.upsert({ where: { environment: input.environment },
      create: { environment: input.environment, ...data }, update: data });
    await writeAudit({ userId: actorId, action: "jnt.integration.updated", entity: "JntIntegration",
      entityId: input.environment, meta: { environment: input.environment,
        credentialFieldsChanged: credentialKeys.filter(key => !!input.credentials[key]) } }, tx);
  });
  return readJntPublicStatus(input.environment);
}

export async function activeJntConfig(db: Prisma.TransactionClient = prisma) {
  assertJntScope();
  const environment = jntEnvironment.safeParse(process.env.JNT_API_ENV);
  if (!environment.success) throw new HttpError("Environment J&T belum dipilih oleh operator server", 503);
  // An owner may prepare credentials without authorizing any live carrier request.
  if (environment.data === "production" && process.env.JNT_PRODUCTION_API_APPROVED !== "yes") {
    throw new HttpError("Operasi API J&T Production belum disetujui operator server", 503);
  }
  const row = await db.jntIntegration.findUnique({ where: { environment: environment.data } });
  if (!row?.enabled || !row.legacyEncryptedConfig) throw new HttpError("Konfigurasi historis J&T belum tersedia", 503);
  const config = decryptJntConfig(row.legacyEncryptedConfig, environment.data);
  validateJntConfig(config, environment.data);
  return config;
}
