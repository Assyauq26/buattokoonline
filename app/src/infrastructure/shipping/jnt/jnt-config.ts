import { z } from "zod";
import { locationSchema } from "@/modules/regions/region.validation";
const service = z.enum(["EZ", "HBO", "JND", "ECO"]);
const approval = { reference: z.string().min(4).max(200), approvedBy: z.string().min(2).max(100), validUntil: z.string().datetime() };
/** Operator/admin supplied configuration, never sample rates or inferred carrier mappings. */
export const manualConfigSchema = z.object({
  origin: locationSchema.extend({ warehouseId: z.string().min(1), street: z.string().min(4) }),
  rates: z.array(z.object({
    destinationVillageCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/),
    minWeightGram: z.number().int().positive(), maxWeightGram: z.number().int().positive(),
    service, cost: z.number().int().nonnegative().max(2_147_483_647), etd: z.string().max(100).optional(),
    ...approval,
  }).refine(r => r.maxWeightGram >= r.minWeightGram)).max(10000),
}).strict();
/** Official J&T L3 mapping is authoritative at district, not village, level.
 * areaCode = official J&T district name for Tariff Check (destAreaCode).
 * cityCode and receiverAreaCode are official codes reserved for Create Order. */
export const areaMappingSchema = z.array(z.object({
  indonesiaCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}$/),
  areaCode: z.string().regex(/^[A-Z][A-Z0-9 -]{1,79}$/),
  cityCode: z.string().regex(/^[A-Z0-9]{3}$/).optional(),
  receiverAreaCode: z.string().regex(/^[A-Z0-9]{1,10}$/).optional(),
  reference: z.string().min(4),
  confirmedAt: z.string().datetime(),
}).strict()).max(100000).refine(rows => new Set(rows.map(row => row.indonesiaCode)).size === rows.length, "Mapping wilayah duplikat");
export function getManualJntConfig() {
  const raw = process.env.JNT_MANUAL_RATE_CONFIG;
  if (!raw) return null;
  try { return manualConfigSchema.parse(JSON.parse(raw)); } catch { throw new Error("Konfigurasi tarif manual J&T tidak valid"); }
}
export function getJntAreaMappings() {
  try { return areaMappingSchema.parse(JSON.parse(process.env.JNT_OFFICIAL_AREA_MAPPING || "[]")); }
  catch { throw new Error("Konfigurasi mapping resmi J&T tidak valid"); }
}
