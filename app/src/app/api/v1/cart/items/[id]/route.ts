import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { updateItem, removeItem } from "@/modules/cart/cart.service";

export const dynamic = "force-dynamic";

const schema = z.object({ quantity: z.number().int() });
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    const body = schema.parse(await req.json());
    return ok(await updateItem(user.id, id, body.quantity));
  });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    return ok(await removeItem(user.id, id));
  });
}
