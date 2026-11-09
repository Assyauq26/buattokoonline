import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle } from "@/lib/response";
import { operationOk } from "@/modules/admin/operations-cache";
import { completeOrderForBuyer } from "@/modules/orders/orders.service";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser();
    return operationOk(await completeOrderForBuyer((await params).id, u.id));
  });
}
