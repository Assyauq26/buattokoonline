import { ok, handle } from "@/lib/response";
import { listProducts } from "@/modules/catalog/catalog.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const result = await listProducts({
      categorySlug: searchParams.get("category") ?? undefined,
      brandSlug: searchParams.get("brand") ?? undefined,
      search: searchParams.get("q") ?? undefined,
      featured: searchParams.get("featured") === "1",
      flashSale: searchParams.get("flash") === "1",
      sort: (searchParams.get("sort") as any) ?? undefined,
      page: Number(searchParams.get("page")) || 1,
      pageSize: Number(searchParams.get("pageSize")) || 12,
    });
    return ok(result);
  });
}
