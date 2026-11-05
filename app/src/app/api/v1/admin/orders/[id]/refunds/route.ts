import { operationOk } from "@/modules/admin/operations-cache";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok } from "@/lib/response";
import { requestRefund, listRefundLedger } from "@/modules/payments/refund.service";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { assertMutationOrigin(req); const actor = await requirePermission(PERMISSIONS.PAYMENT_VERIFY); return operationOk(await requestRefund((await params).id, actor.id, await req.json()), 201); });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { const actor = await requirePermission(PERMISSIONS.PAYMENT_READ); return ok(await listRefundLedger((await params).id, actor.id)); });
}
