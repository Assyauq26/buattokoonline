import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { jntLocationSchema, type RegionLevel, type RegionList, type SelectedLocation } from "@/modules/regions/region.validation";
import { findVerifiedJntDistrict } from "./verified-mapping";

export async function getJntRegions(version: string | null, level: RegionLevel, parent: string, province: string): Promise<RegionList> {
  const list: RegionList = { data: [], source: "jnt-mapping", updatedAt: version ?? "" };
  if (!version || level === "villages") return list;
  if (parent.length > 130 || province.length > 130 || (level !== "provinces" && !parent) || (level === "districts" && !province)) {
    throw new HttpError("Induk wilayah mapping J&T tidak valid", 422);
  }
  const where = { version, approvedAt: { not: null }, matchStatus: "EXACT", sendSiteCode: { not: null },
    originCityCode: { not: null }, destAreaCode: { not: null } };
  if (level === "provinces") {
    const rows = await prisma.jntL3Mapping.findMany({ where, distinct: ["province"], select: { province: true }, orderBy: { province: "asc" } });
    list.data = rows.map(row => ({ code: row.province, name: row.province }));
  } else if (level === "regencies") {
    const rows = await prisma.jntL3Mapping.findMany({ where: { ...where, province: parent }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" } });
    list.data = rows.map(row => ({ code: row.city, name: row.city }));
  } else {
    const rows = await prisma.jntL3Mapping.findMany({ where: { ...where, province, city: parent },
      select: { district: true, jntAreaCode: true }, orderBy: { district: "asc" } });
    list.data = rows.map(row => ({ code: "JNT-" + row.jntAreaCode, name: row.district }));
  }
  return list;
}

export async function validateJntLocation(input: unknown, version: string): Promise<SelectedLocation> {
  const parsed = jntLocationSchema.safeParse(input);
  if (!parsed.success) throw new HttpError("Pilih ulang wilayah pengiriman dari daftar J&T.", 422);
  const { provinceCode, cityCode, districtCode } = parsed.data;
  const row = await findVerifiedJntDistrict(districtCode, version);
  if (provinceCode !== row.province || cityCode !== row.city) {
    throw new HttpError("Wilayah pengiriman berubah. Pilih ulang dari daftar J&T.", 422);
  }
  return { ...parsed.data, province: row.province, city: row.city, district: row.district,
    village: "", regionSource: "jnt-mapping", regionUpdatedAt: (row.approvedAt ?? new Date(0)).toISOString() };
}
