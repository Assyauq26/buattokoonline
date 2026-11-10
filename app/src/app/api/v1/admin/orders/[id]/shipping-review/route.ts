import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok, HttpError } from "@/lib/response";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requirePermission(PERMISSIONS.SHIPPING_READ);
    const o = await prisma.order.findUnique({
      where: { id: (await params).id },
      select: {
        orderNumber: true,
        shippingService: true,
        shippingWeightGram: true,
        address: {
          select: {
            recipientName: true,
            phone: true,
            line: true,
            village: true,
            district: true,
            city: true,
            province: true,
          },
        },
        items: {
          select: {
            id: true,
            productName: true,
            variantLabel: true,
            quantity: true,
          },
        },
      },
    });
    if (!o) throw new HttpError("Pesanan tidak ditemukan", 404);
    const r = ok(o);
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  });
}
