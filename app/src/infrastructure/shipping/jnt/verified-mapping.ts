import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";

/** Only exact, explicitly released L3 crosswalk rows are trusted for real checkout. */
export async function getVerifiedJntDistrict(districtCode: string) {
  if (!/^\d{2}\.\d{2}\.\d{2}$/.test(districtCode)) {
    throw new HttpError("Kode kecamatan administratif tidak valid", 422);
  }
  const release = await prisma.jntMappingRelease.findUnique({ where: { key: "primary" } });
  if (!release) throw new HttpError("Mapping wilayah J&T belum diaktifkan oleh operator", 503);
  const matches = await prisma.jntL3Mapping.findMany({
    where: {
      version: release.activeVersion,
      emsifaDistrictCode: districtCode,
      matchStatus: "EXACT",
      approvedAt: { not: null },
    }, take: 2,
  });
  if (matches.length !== 1) {
    throw new HttpError("Kecamatan belum memiliki mapping J&T yang terverifikasi", 422);
  }
  const row = matches[0];
  return {
    version: row.version, originProvince: row.province,
    destinationCity: row.jntCity, destinationArea: row.jntDistrict,
    destinationCityCode: row.jntCityCode, receiverArea: row.jntAreaCode,
  };
}
