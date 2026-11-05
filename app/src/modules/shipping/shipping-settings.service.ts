import "server-only";
import { randomUUID } from "node:crypto";
import type { JntCheckoutRevision, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { writeAudit } from "@/modules/audit/audit.service";
import { activeJntConfig, decryptJntConfig, jntEnvironment, readJntSettings, requireCarrierEnvironment, requireEz, validateJntConfig, type JntEnvironment } from "@/infrastructure/shipping/jnt/official-config";
import { mappedWarehouse, readActiveJntRelease } from "@/infrastructure/shipping/jnt/verified-mapping";
import { validTariffProof } from "@/infrastructure/shipping/jnt/tariff-proof";
import { flatShippingRate } from "./shipping-settings-input";

export async function readShippingSettings(db: Prisma.TransactionClient = prisma) {
  return db.shippingSettings.findUniqueOrThrow({ where: { id: 1 }, include: { activeJnt: true } });
}

export async function lockShippingSettings(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM "ShippingSettings" WHERE id = 1 FOR UPDATE`;
}

export async function setManualShipping(cost: number, actor: string) {
  const { cost: manualFlat } = flatShippingRate(cost);
  await prisma.$transaction(async tx => {
    await lockShippingSettings(tx);
    await tx.shippingSettings.update({ where: { id: 1 }, data: { manualFlat, activeJntId: null, revision: { increment: 1 } } });
    await writeAudit({ userId: actor, action: "shipping.method.manual", entity: "ShippingSettings", entityId: "1", meta: { manualFlat } }, tx);
  });
}

async function jntChecklist(environment: JntEnvironment, db: Prisma.TransactionClient = prisma) {
  const checks: { label: string; ready: boolean; reason?: string }[] = [];
  async function check<T>(label: string, run: () => Promise<T> | T) {
    try {
      const result = await run();
      checks.push({ label, ready: true });
      return result;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      checks.push({ label, ready: false, reason: error.message });
      return null;
    }
  }
  const row = await db.jntIntegration.findUnique({ where: { environment } });
  const state = await check("Konfigurasi empat endpoint dan enkripsi", async () => {
    const saved = await readJntSettings(environment, db);
    if (!saved) throw new HttpError("Simpan konfigurasi J&T terlebih dahulu", 422);
    validateJntConfig(saved.config, environment);
    return saved;
  });
  await check("Environment dan persetujuan operator", () => requireCarrierEnvironment(environment));
  await check("Persetujuan layanan EZ", () => {
    if (!state) throw new HttpError("Lengkapi konfigurasi layanan EZ", 422);
    requireEz(state.config);
  });
  const warehouse = await check("Mapping resmi aktif dan gudang pengirim", async () => {
    const district = state?.config.seller?.warehouse.districtCode;
    if (!district) throw new HttpError("Pilih kecamatan gudang dari mapping resmi", 422);
    const { version, releaseStamp } = await readActiveJntRelease(db);
    const origin = await mappedWarehouse(district, version, db);
    if (!await db.jntMappingImport.findUnique({ where: { version: origin.version }, select: { version: true } })) {
      throw new HttpError("Unggah dan aktifkan mapping dengan lima kode J&T yang terpisah", 422);
    }
    return { ...origin, releaseStamp };
  });
  await check("Cek tarif EZ untuk konfigurasi tersimpan", () => {
    if (!warehouse || !state || !validTariffProof(state.tariffProof, state.config, environment, warehouse.releaseStamp)) {
      throw new HttpError("Uji tarif draft dengan mapping aktif, lalu simpan hasilnya. Hasil berlaku 24 jam untuk aktivasi.", 422);
    }
  });
  return { checks, row, warehouse };
}

export async function shippingSettingsStatus(environment: JntEnvironment) {
  const [settings, readiness] = await Promise.all([readShippingSettings(), jntChecklist(environment)]);
  return { manualFlat: settings.manualFlat, activeEnvironment: settings.activeJnt?.environment ?? null,
    activeMappingVersion: settings.activeJnt?.mappingVersion ?? null, checks: readiness.checks };
}

export async function activateJntShipping(environment: JntEnvironment, actor: string) {
  await prisma.$transaction(async tx => {
    await lockShippingSettings(tx);
    const { checks, row, warehouse } = await jntChecklist(environment, tx);
    const failed = checks.find(check => !check.ready);
    if (failed || !row || !warehouse) throw new HttpError(failed?.reason || "Konfigurasi J&T belum siap", 409);
    const current = await readShippingSettings(tx);
    if (current.activeJnt?.environment === environment &&
        current.activeJnt.encryptedConfig === row.encryptedConfig &&
        current.activeJnt.mappingVersion === warehouse.version) return;
    const activeJntId = randomUUID();
    await tx.jntCheckoutRevision.create({ data: { id: activeJntId, environment,
      encryptedConfig: row.encryptedConfig, mappingVersion: warehouse.version } });
    await tx.shippingSettings.update({ where: { id: 1 }, data: { activeJntId, revision: { increment: 1 } } });
    await writeAudit({ userId: actor, action: "shipping.method.jnt", entity: "ShippingSettings", entityId: "1",
      meta: { environment, mappingVersion: warehouse.version, revisionId: activeJntId } }, tx);
  });
}

export function approvedRevision(revision: JntCheckoutRevision) {
  const environment = jntEnvironment.parse(revision.environment);
  requireCarrierEnvironment(environment);
  const config = decryptJntConfig(revision.encryptedConfig, environment);
  validateJntConfig(config, environment);
  return { config, environment, mappingVersion: revision.mappingVersion };
}

export async function historicJntConfig(revisionId: string | null, db: Prisma.TransactionClient = prisma) {
  if (!revisionId) {
    const state = await readShippingSettings(db);
    return { config: await activeJntConfig(db), mappingVersion: state.legacyMappingVersion ?? undefined,
      environment: jntEnvironment.parse(process.env.JNT_API_ENV) };
  }
  return approvedRevision(await db.jntCheckoutRevision.findUniqueOrThrow({ where: { id: revisionId } }));
}
