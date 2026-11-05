import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { HttpError } from "@/lib/http-error";
import { fetchRegions } from "./region-provider";
import { assertRegionParent, locationSchema, type RegionLevel, type RegionList, type SelectedLocation } from "./region.validation";

let snapshot: Record<string, RegionList> | undefined;
const cache = new Map<string, { list: RegionList; expires: number }>();
const pending = new Map<string, Promise<RegionList>>();
function localList(key: string) {
  snapshot ??= JSON.parse(gunzipSync(readFileSync(join(process.cwd(), "src/modules/regions/data/snapshot.json.gz"))).toString()) as Record<string, RegionList>;
  const list = snapshot[key];
  if (!list) throw new HttpError("Wilayah tidak ditemukan", 422);
  return { ...list, fallback: true };
}
/** One provider request per key, bounded memory and 24h TTL; bundled v2 snapshot survives outages/restarts. */
export async function getRegions(level: RegionLevel, parent = ""): Promise<RegionList> {
  try { assertRegionParent(level, parent); } catch { throw new HttpError("Kode induk wilayah tidak valid", 422); }
  const key = `${level}${parent ? `/${parent}` : ""}`;
  // Reject invented IDs before reaching an external provider.
  const fallback = localList(key);
  if (process.env.REGION_DATA_MODE === "snapshot") return fallback;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.list;
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 16) return fallback;
  const request = (async () => {
    let list: RegionList;
    try { list = await fetchRegions(level, parent); } catch { list = fallback; }
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(key, { list, expires: Date.now() + (list.fallback ? 300_000 : 86_400_000) });
    return list;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
export async function validateLocation(value: unknown): Promise<SelectedLocation> {
  const loc = locationSchema.parse(value);
  const levels = ["provinces", "regencies", "districts", "villages"] as const;
  const codes = [loc.provinceCode, loc.cityCode, loc.districtCode, loc.villageCode];
  const names: string[] = [], dates: string[] = [];
  let postalCode: string | undefined;
  for (let i = 0; i < 4; i++) {
    const list = await getRegions(levels[i], i ? codes[i - 1] : "");
    const region = list.data.find(r => r.code === codes[i]);
    if (!region) throw new HttpError("Kombinasi wilayah tidak valid. Pilih lokasi kembali.", 422);
    names.push(region.name); dates.push(list.updatedAt); postalCode = region.postalCode;
  }
  if (postalCode && postalCode !== loc.postalCode) throw new HttpError("Kode pos tidak sesuai desa/kelurahan.", 422);
  return { ...loc, province: names[0], city: names[1], district: names[2], village: names[3], regionSource: "emsifa-v2", regionUpdatedAt: dates.sort()[0] };
}
