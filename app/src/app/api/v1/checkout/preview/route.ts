import { z } from "zod";
import { checkoutIntentId } from "@/modules/checkout/checkout-intent";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { previewCheckout } from "@/modules/checkout/checkout.service";
import { locationSchema } from "@/modules/regions/region.validation";

export const dynamic = "force-dynamic";

const schema = z.object({
  intentId: checkoutIntentId.optional(),
  couponCode: z.string().max(64).optional(),
  address: locationSchema.optional(),
  shipping: z.object({ courier: z.literal("J&T Express"), service: z.string().min(1).max(100), cost: z.number().int().nonnegative(), quoteToken: z.string().min(1).max(4096) }).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    return ok(await previewCheckout(user.id, body));
  });
}
