import "server-only";
import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Recheck the operator's current enrollment/role/permissions on every job and
 * checkout; a saved actor ID is not a permanent authorization capability. */
export async function assertBluOperator(tx: Prisma.TransactionClient, actorId: string) {
  const enrolled = (process.env.PAYMENT_EVIDENCE_ADMIN_IDS || "").split(",").map(s => s.trim());
  const user = await tx.user.findFirst({ where: { id: actorId, isActive: true, deletedAt: null,
    roles: { some: { role: { name: "Admin" } } } }, select: { id: true } });
  if (!user || !enrolled.includes(actorId)) throw new HttpError("Pengelola blu tidak lagi memiliki akses", 403);
  await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
  await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_READ);
  await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
}
