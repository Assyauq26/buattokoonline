import { handle, ok, fail } from "@/lib/response";
import { getPurchaseOptions } from "@/modules/catalog/purchase-options.service";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const response = await handle(async () => {
    const { slug } = await params;
    if (!slug || slug.length > 200) return fail("Produk tidak ditemukan", 404);
    return ok(await getPurchaseOptions(slug));
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
