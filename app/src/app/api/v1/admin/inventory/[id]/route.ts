import { operationOk } from "@/modules/admin/operations-cache";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle } from "@/lib/response";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { adjustManagedInventory } from "@/modules/inventory/inventory-management.service";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertMutationOrigin(req);
    const actor = await requirePermission(PERMISSIONS.INVENTORY_ADJUST);
    const result = await adjustManagedInventory((await params).id, actor.id, await req.json());
    return operationOk(result);
  });
}
