import { ok, handle } from "@/lib/response";
import { searchSuggestions } from "@/modules/catalog/catalog.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok(await searchSuggestions(q));
  });
}
