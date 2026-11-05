import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { addItem } from "@/modules/cart/cart.service";

export const dynamic = "force-dynamic";

const schema = z.object({ variantId: z.string().min(1), quantity: z.number().int().positive().default(1) });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const view = await addItem(user.id, body.variantId, body.quantity);
    return ok(view, 201);
  });
}
