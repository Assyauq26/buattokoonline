import { operationOk } from "@/modules/admin/operations-cache";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { handle } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { approvePayment } from "@/modules/payments/payments.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  return handle(async () => {
    assertMutationOrigin(req);
    const { id } = await params;
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    return operationOk(await approvePayment(id, admin.id));
  });
}
