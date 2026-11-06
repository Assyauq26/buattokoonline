import { getJntRegions, searchJntRegions } from "@/infrastructure/shipping/jnt/mapping-regions";
import { findVerifiedJntDistrict, readActiveJntRelease } from "@/infrastructure/shipping/jnt/verified-mapping";
import { readShippingSettings } from "@/modules/shipping/shipping-settings.service";
import { getCurrentUser } from "@/lib/auth/session";
import { isJntSettingsAdministrator } from "@/infrastructure/shipping/jnt/official-config";
import { z } from "zod";
import { ok, handle, HttpError } from "@/lib/response";
import { getRegions, searchRegions } from "@/modules/regions/region.service";
import { regionLevels } from "@/modules/regions/region.validation";
export async function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    const query = params.has("q") ? z.string().trim().min(2).max(80).parse(params.get("q")) : null;
    const level = z.enum(regionLevels).parse(params.get("level"));
    const source = params.get("source");
    if (source === "jnt-checkout" || source === "jnt-warehouse") {
      let version: string | null;
      if (source === "jnt-warehouse") {
        if (!isJntSettingsAdministrator(await getCurrentUser(false))) throw new HttpError("Akses gudang ditolak", 403);
        version = (await readActiveJntRelease().catch(error => {
          if (error instanceof HttpError && error.status === 503) return null;
          throw error;
        }))?.version ?? null;
        const selected = params.get("selected");
        if (selected && version) {
          const row = await findVerifiedJntDistrict(selected, version);
          return ok({ province: row.province, city: row.city });
        }
      } else {
        version = (await readShippingSettings()).activeJnt?.mappingVersion ?? null;
      }
      const response = ok(query ? { results: await searchJntRegions(version, query) } : await getJntRegions(version, level, params.get("parent") || "", params.get("province") || ""));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const data = query ? { results: searchRegions(query) } : await getRegions(level, params.get("parent") || "");
    const response = ok(data);
    response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return response;
  });
}
