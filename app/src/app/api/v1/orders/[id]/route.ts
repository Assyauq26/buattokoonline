import { ok, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { getOrderForUser } from "@/modules/orders/orders.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    return ok(await getOrderForUser(user.id, id));
  });
}
