import { z } from "zod";
import { checkoutIntentId } from "@/modules/checkout/checkout-intent";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { checkoutLinesSchema, checkoutQuoteSchema } from "@/modules/checkout/checkout.validation";
import { createOrder } from "@/modules/checkout/checkout.service";
import { listOrdersForUser } from "@/modules/orders/orders.service";
import { addressSchema } from "@/modules/regions/region.validation";
import { shippingCourierSchema } from "@/modules/shipping/shipping-settings-input";

export const dynamic = "force-dynamic";

const schema = z.object({
  intentId: checkoutIntentId.optional(),
  address: addressSchema.transform(address => ({ ...address, city: address.city || "", province: address.province || "" })),
  shipping: z.object({ courier: shippingCourierSchema, service: z.string().max(30), cost: z.number().int().nonnegative(), quoteToken: z.string().min(1).max(4096) }),
  bankAccountId: z.string().min(1),
  couponCode: z.string().optional(),
  note: z.string().optional(),
  expectedLines: checkoutLinesSchema.optional(),
  expectedQuote: checkoutQuoteSchema.optional(),
  requestId: z.string().uuid().optional(),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok(await listOrdersForUser(user.id));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const order = await createOrder(user.id, body);
    return ok(order, 201);
  });
}
