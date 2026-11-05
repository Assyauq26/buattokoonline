import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok } from "@/lib/response";
import { refundReturnEligibility } from "@/modules/payments/refund.service";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { const actor = await requirePermission(PERMISSIONS.INVENTORY_READ); return ok(await refundReturnEligibility((await params).id, actor.id)); });
}
