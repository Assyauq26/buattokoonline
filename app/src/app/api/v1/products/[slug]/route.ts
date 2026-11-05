import { ok, fail, handle } from "@/lib/response";
import { getProductBySlug } from "@/modules/catalog/catalog.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { slug } = await params;
    const product = await getProductBySlug(slug);
    if (!product) return fail("Produk tidak ditemukan", 404);
    return ok(product);
  });
}
