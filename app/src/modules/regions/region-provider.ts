import { z } from "zod";
import { assertRegionParent, type RegionLevel, type RegionList } from "./region.validation";
export const REGION_SOURCE = "https://www.emsifa.com/api-wilayah-indonesia/v2";
const envelope = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string().min(1), postal_code: z.string().nullable().optional() })),
  meta: z.object({ updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), level: z.number() }),
});
export function normalizeRegionList(value: unknown, level: RegionLevel, parent = ""): RegionList {
  assertRegionParent(level, parent);
  const parsed = envelope.parse(value);
  const depth = { provinces: 1, regencies: 2, districts: 3, villages: 4 }[level];
  if (parsed.meta.level !== depth) throw new Error("Versi wilayah tidak sesuai");
  const pattern = [null, /^\d{2}$/, /^\d{2}\.\d{2}$/, /^\d{2}\.\d{2}\.\d{2}$/, /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/][depth]!;
  const seen = new Set<string>();
  return { source: REGION_SOURCE, updatedAt: parsed.meta.updated_at, data: parsed.data.map(r => {
    if (!pattern.test(r.id) || (parent && !r.id.startsWith(parent + ".")) || seen.has(r.id)) throw new Error("Hierarki wilayah tidak valid");
    seen.add(r.id);
    if (r.postal_code && !/^\d{5}$/.test(r.postal_code)) throw new Error("Kode pos provider tidak valid");
    return { code: r.id, name: r.name, ...(r.postal_code ? { postalCode: r.postal_code } : {}) };
  }) };
}
export async function fetchRegions(level: RegionLevel, parent = ""): Promise<RegionList> {
  assertRegionParent(level, parent);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${REGION_SOURCE}/${level}${parent ? `/${parent}` : ""}.json`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
      if (!response.ok) throw new Error("Provider wilayah tidak tersedia");
      return normalizeRegionList(await response.json(), level, parent);
    } catch (error) { if (attempt === 1) throw error; }
  }
}
