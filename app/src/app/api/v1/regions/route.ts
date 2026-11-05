import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { getRegions } from "@/modules/regions/region.service";
import { regionLevels } from "@/modules/regions/region.validation";
export async function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    const level = z.enum(regionLevels).parse(params.get("level"));
    const data = await getRegions(level, params.get("parent") || "");
    const response = ok(data);
    response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return response;
  });
}
