import { z } from "zod";

export const regionLevels = ["provinces", "regencies", "districts", "villages"] as const;
export type RegionLevel = typeof regionLevels[number];
export const regionCode = z.string().regex(/^\d{2}(?:\.\d{2}(?:\.\d{2}(?:\.\d{4})?)?)?$/);
export const locationSchema = z.object({
  provinceCode: z.string().regex(/^\d{2}$/),
  cityCode: z.string().regex(/^\d{2}\.\d{2}$/),
  districtCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}$/),
  villageCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/),
  postalCode: z.string().regex(/^\d{5}$/),
});
export type LocationCodes = z.infer<typeof locationSchema>;
export interface Region { code: string; name: string; postalCode?: string }
export interface RegionList { data: Region[]; source: string; updatedAt: string; fallback?: boolean }
export interface SelectedLocation extends LocationCodes {
  province: string; city: string; district: string; village: string;
  regionSource: string; regionUpdatedAt: string;
}
export const addressSchema = locationSchema.extend({
  recipientName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(25).refine(value => /^\+?\d[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15, "Masukkan nomor HP yang valid."),
  line: z.string().trim().min(4).max(1000),
  // Names submitted by the client are ignored; canonical names come from the provider.
  city: z.string().max(150).optional(), province: z.string().max(150).optional(),
});
export function assertRegionParent(level: RegionLevel, parent: string) {
  const patterns = { provinces: /^$/, regencies: /^\d{2}$/, districts: /^\d{2}\.\d{2}$/, villages: /^\d{2}\.\d{2}\.\d{2}$/ };
  if (!patterns[level].test(parent)) throw new Error("Kode induk wilayah tidak valid");
}
