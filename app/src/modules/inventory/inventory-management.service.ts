import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { writeAudit } from "@/modules/audit/audit.service";
import { adjustStock } from "./inventory.service";
import { stockAdjustmentSchema } from "./inventory.validation";

/** Staff boundary around existing CAS adjustment; stock movement and audit commit together. */
export async function adjustManagedInventory(variantId: string, actorId: string, value: unknown) {
  const input = stockAdjustmentSchema.parse(value);
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.INVENTORY_READ);
    await assertStaffPermission(tx, actorId, PERMISSIONS.INVENTORY_ADJUST);
    if (!await tx.productVariant.findUnique({ where: { id: variantId } })) throw new HttpError("Varian tidak ditemukan", 404);
    const result = await adjustStock(variantId, input.newOnHand, input.reason, { tx, expectedOnHand: input.expectedOnHand, reference: actorId });
    await writeAudit({ userId: actorId, action: "inventory.adjust", entity: "Inventory", entityId: result.id, meta: { variantId, before: input.expectedOnHand, after: result.onHand, reason: input.reason } }, tx);
    return result;
  });
}
