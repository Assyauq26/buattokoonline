import { assertSameOrigin } from "@/lib/mutation-origin";
import {
  reviseShipping,
  shippingFingerprint,
} from "@/modules/shipping/shipping-review";
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
        address: true,
        items: {
          select: {
            id: true,
            variant: { select: { productId: true } },
            productName: true,
            variantLabel: true,
            quantity: true,
          },
        },
      },
    });
    if (!o) throw new HttpError("Pesanan tidak ditemukan", 404);
    const r = ok({ ...o, fingerprint: shippingFingerprint(o) });
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  });
}

async function change(
  req: Request,
  context: { params: Promise<{ id: string }> },
  save: boolean,
) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requirePermission(PERMISSIONS.SHIPPING_CREATE);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4096)
      throw new HttpError("Request terlalu besar", 413);
    const result = await reviseShipping(
      (await context.params).id,
      actor.id,
      JSON.parse(raw),
      save,
    );
    const response = ok(result);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return change(req, c, false);
}
export async function PATCH(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return change(req, c, true);
}
