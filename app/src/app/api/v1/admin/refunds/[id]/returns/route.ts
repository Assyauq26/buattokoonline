import { operationOk } from "@/modules/admin/operations-cache";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle } from "@/lib/response";
import { receiveRefundReturn } from "@/modules/payments/refund.service";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { assertMutationOrigin(req); const actor = await requirePermission(PERMISSIONS.INVENTORY_ADJUST); return operationOk(await receiveRefundReturn((await params).id, actor.id, await req.json()), 201); });
}
