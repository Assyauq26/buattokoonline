import { z } from "zod";
import { jntDistrictCodePattern } from "@/infrastructure/shipping/jnt/mapping-codes";

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
export const jntLocationSchema = z.object({
  provinceCode: z.string().min(1).max(130),
  cityCode: z.string().min(1).max(130),
  districtCode: z.string().regex(jntDistrictCodePattern),
  villageCode: z.literal(""),
  postalCode: locationSchema.shape.postalCode,
});
export const checkoutLocationSchema = z.union([locationSchema, jntLocationSchema]);
export type LocationCodes = z.infer<typeof checkoutLocationSchema>;
export interface Region { code: string; name: string; postalCode?: string }
export interface RegionList { data: Region[]; source: string; updatedAt: string; fallback?: boolean }
export type SelectedLocation = LocationCodes & {
  province: string; city: string; district: string; village: string;
  regionSource: string; regionUpdatedAt: string;
};
const contactSchema = z.object({
  recipientName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(25).refine(value => /^\+?\d[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15, "Masukkan nomor HP yang valid."),
  line: z.string().trim().min(4).max(1000),
  // Names submitted by the client are ignored; canonical names come from the provider.
  city: z.string().max(150).optional(), province: z.string().max(150).optional(),
});
export const addressSchema = z.union([locationSchema.extend(contactSchema.shape), jntLocationSchema.extend(contactSchema.shape)]);
export function assertRegionParent(level: RegionLevel, parent: string) {
  const patterns = { provinces: /^$/, regencies: /^\d{2}$/, districts: /^\d{2}\.\d{2}$/, villages: /^\d{2}\.\d{2}\.\d{2}$/ };
  if (!patterns[level].test(parent)) throw new Error("Kode induk wilayah tidak valid");
}
