import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { writeAudit } from "@/modules/audit/audit.service";
import { seal, unseal } from "../evidence/secrets";

export function scope() {
  const value = process.env.STORE_INSTALLATION_ID;
  if (!value || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw new HttpError("Identitas instalasi belum tersedia", 503);
  return value;
}
export function publicOrigin() {
  const url = new URL(process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_BASE_URL || "http://invalid");
  if (url.protocol !== "https:" || url.username || url.password) throw new HttpError("URL HTTPS toko belum tersedia", 503);
  return url.origin;
}
export const settingsInput = z.object({ environment: z.enum(["production", "sandbox"]),
  merchantId: z.string().trim().regex(/^[A-Za-z0-9_-]{3,100}$/),
  clientKey: z.string().trim().max(256), serverKey: z.string().trim().max(256), enabled: z.boolean() }).strict();
export async function readSettings() {
  const setting = await prisma.midtransSetting.findUnique({ where: { storeScope: scope() }, include: { configuration: true } });
  const config = setting?.configuration;
  const last = await prisma.midtransAttempt.findFirst({ where: { configuration: { storeScope: scope() }, lastCheckedAt: { not: null } },
    orderBy: { lastCheckedAt: "desc" }, select: { lastCheckedAt: true, lastError: true } });
  return { enabled: setting?.enabled || false, environment: config?.environment || "production", merchantId: config?.merchantId || "",
    configured: !!config, clientKeyStored: !!config?.clientKey, serverKeyStored: !!config?.serverKeyEnvelope,
    lastCheckedAt: last?.lastCheckedAt?.toISOString() || null, lastError: last?.lastError || null,
    encryptionReady: /^[A-Za-z0-9+/]{43}=$/.test(process.env.PAYMENT_INTEGRATION_ENCRYPTION_KEY || ""),
    notificationUrl: `${publicOrigin()}/api/v1/payments/midtrans/notification`, finishUrl: `${publicOrigin()}/payments/midtrans/finish` };
}
export async function saveSettings(actorId: string, raw: unknown) {
  const input = settingsInput.parse(raw);
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`midtrans-settings:${scope()}`}, 0))`);
    const old = await tx.midtransSetting.findUnique({ where: { storeScope: scope() }, include: { configuration: true } });
    const prior = old?.configuration;
    const sameRealm = prior?.environment === input.environment && prior.merchantId === input.merchantId;
    const clientKey = input.clientKey || (sameRealm ? prior!.clientKey : "");
    const serverKey = input.serverKey || (sameRealm ? unseal(prior!.serverKeyEnvelope, scope(), prior!.id, "midtrans-server-key") : "");
    const prefix = input.environment === "sandbox" ? "SB-Mid-" : "Mid-";
    if (!clientKey.startsWith(prefix + "client-") || !serverKey.startsWith(prefix + "server-") ||
        !/^[A-Za-z0-9._-]{15,256}$/.test(clientKey) || !/^[A-Za-z0-9._-]{15,256}$/.test(serverKey))
      throw new HttpError("Isi Client Key dan Server Key yang sesuai environment. Pergantian merchant/environment memerlukan kedua key.", 422);
    let configId = prior?.id;
    if (!sameRealm || input.clientKey || input.serverKey) {
      configId = randomUUID();
      await tx.midtransConfiguration.create({ data: { id: configId, storeScope: scope(), environment: input.environment,
        merchantId: input.merchantId, clientKey, serverKeyEnvelope: seal(serverKey, scope(), configId, "midtrans-server-key"), createdBy: actorId } });
    }
    await tx.midtransSetting.upsert({ where: { storeScope: scope() }, create: { storeScope: scope(), configId, enabled: input.enabled }, update: { configId, enabled: input.enabled } });
    await writeAudit({ userId: actorId, action: "midtrans.settings_saved", entity: "MidtransSetting", entityId: scope(),
      meta: { configId, environment: input.environment, enabled: input.enabled } }, tx);
    return { saved: true, message: "Konfigurasi tersimpan. Kredensial terverifikasi ketika permintaan transaksi pertama berhasil." };
  });
}
export async function checkoutAvailable() {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(process.env.PAYMENT_INTEGRATION_ENCRYPTION_KEY || "")) return false;
  return !!await prisma.midtransSetting.findFirst({ where: { storeScope: scope(), enabled: true, configuration: { storeScope: scope(), environment: "production" } }, select: { storeScope: true } });
}
export async function snapshotAttempt(tx: Prisma.TransactionClient, paymentId: string, amount: number, expiresAt: Date) {
  await tx.$executeRaw(Prisma.sql`SELECT "storeScope" FROM "MidtransSetting" WHERE "storeScope" = ${scope()} FOR SHARE`);
  const setting = await tx.midtransSetting.findUnique({ where: { storeScope: scope() }, include: { configuration: true } });
  if (!setting?.enabled || setting.configuration?.storeScope !== scope() || setting.configuration.environment !== "production")
    throw new HttpError("Midtrans belum siap. Pilih metode lain secara eksplisit atau hubungi toko.", 409);
  return tx.midtransAttempt.create({ data: { id: randomUUID(), paymentId, configId: setting.configuration.id,
    providerOrderId: "BTS-" + randomUUID().replaceAll("-", ""), amount, expiresAt } });
}
