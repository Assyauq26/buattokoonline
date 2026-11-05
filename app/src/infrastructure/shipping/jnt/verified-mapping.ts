import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import type { Prisma } from "@prisma/client";

export const districtCodePattern = /^\d{2}\.\d{2}\.\d{2}$/;
export const tariffAreaPattern = /^[A-Z][A-Z0-9 -]{1,79}$/;

export async function readActiveJntRelease(db: Prisma.TransactionClient = prisma) {
  const release = await db.jntMappingRelease.findUnique({ where: { key: "primary" } });
  if (!release) throw new HttpError("Aktifkan versi mapping wilayah J&T terlebih dahulu", 503);
  return { version: release.activeVersion, releaseStamp: release.activeVersion + ":" + release.approvedAt.toISOString() };
}

export async function getVerifiedJntDistrict(districtCode: string, version?: string, db: Prisma.TransactionClient = prisma) {
  if (!districtCodePattern.test(districtCode)) throw new HttpError("Kode kecamatan administratif tidak valid", 422);
  const activeVersion = version ?? (await readActiveJntRelease(db)).version;
  const matches = await db.jntL3Mapping.findMany({
    where: { version: activeVersion, emsifaDistrictCode: districtCode, matchStatus: "EXACT", approvedAt: { not: null } },
    take: 2,
  });
  if (matches.length !== 1) throw new HttpError("Kecamatan ini belum memiliki mapping J&T resmi yang unik. Pilih kecamatan lain atau hubungi toko.", 422);
  const row = matches[0];
  return {
    version: row.version,
    sendSiteCode: row.sendSiteCode, originCityCode: row.originCityCode, destAreaCode: row.destAreaCode,
    destinationCityCode: row.jntCityCode, receiverArea: row.jntAreaCode,
  };
}

export async function mappedWarehouse(districtCode: string, version?: string, db?: Prisma.TransactionClient) {
  const row = await getVerifiedJntDistrict(districtCode, version, db);
  if (!row.sendSiteCode || !tariffAreaPattern.test(row.sendSiteCode) || !row.originCityCode || !/^[A-Z0-9]{3}$/.test(row.originCityCode)) {
    throw new HttpError("Mapping kecamatan gudang belum memuat sendSiteCode dan origin_code yang sah", 422);
  }
  return { originSite: row.sendSiteCode, originCityCode: row.originCityCode, version: row.version };
}

export async function mappedDestination(districtCode: string, version: string) {
  const row = await getVerifiedJntDistrict(districtCode, version);
  if (!row.destAreaCode || !tariffAreaPattern.test(row.destAreaCode) ||
      !/^[A-Z0-9]{3}$/.test(row.destinationCityCode) || !/^[A-Z0-9]{1,10}$/.test(row.receiverArea)) {
    throw new HttpError("Mapping tujuan belum memuat destAreaCode, destination_code dan receiver_area yang sah. Hubungi toko.", 422);
  }
  return { ...row, destAreaCode: row.destAreaCode };
}
