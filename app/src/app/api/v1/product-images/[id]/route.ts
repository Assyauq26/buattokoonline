import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, HttpError } from "@/lib/response";
import { readManagedProductImage } from "@/modules/catalog/product-images.service";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const image = await prisma.productImage.findUnique({ where: { id: (await params).id }, include: { product: { select: { status: true } } } });
    if (!image) throw new HttpError("Gambar tidak ditemukan", 404);
    if (image.product.status !== "PUBLISHED") {
      const user = await getCurrentUser();
      const staff = user?.isAdmin && user.permissions.includes(PERMISSIONS.PRODUCT_READ);
      const ownsOrder = user && !staff ? await prisma.orderItem.findFirst({ where: { imageUrl: image.url, order: { userId: user.id } }, select: { id: true } }) : null;
      const ownsCart = user && !staff && !ownsOrder ? await prisma.cartItem.findFirst({ where: { variant: { productId: image.productId }, cart: { userId: user.id } }, select: { id: true } }) : null;
      if (!staff && !ownsOrder && !ownsCart) throw new HttpError("Gambar tidak ditemukan", 404);
    }
    const { data, contentType } = await readManagedProductImage(image);
    return new Response(Buffer.from(data), { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  });
}
