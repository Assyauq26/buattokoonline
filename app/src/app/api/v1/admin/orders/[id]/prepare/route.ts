import { assertSameOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle } from "@/lib/response";
import { operationOk } from "@/modules/admin/operations-cache";
import { transitionOrder } from "@/modules/orders/orders.service";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requirePermission(PERMISSIONS.ORDER_UPDATE);
    return operationOk(
      await transitionOrder(
        (await params).id,
        "PACKED",
        actor.id,
        "Seller mulai menyiapkan paket",
      ),
    );
  });
}
