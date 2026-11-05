import { Prisma } from "@prisma/client";
import { ADMIN_ROLES, type PermissionKey } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/response";

/** All lifecycle writers lock Order -> Payment -> Inventory (sorted variant IDs). */
export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`);
  if (!rows.length) throw new HttpError("Order tidak ditemukan", 404);
}
export async function lockPaymentOrder(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
  if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
  await lockOrder(tx, payment.orderId);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
}
export async function assertStaffPermission(tx: Prisma.TransactionClient, id: string, permission: PermissionKey) {
  const user = await tx.user.findUnique({ where: { id }, select: { isActive: true, roles: { select: { role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } } } } } });
  if (!user?.isActive || !user.roles.some(r => ADMIN_ROLES.includes(r.role.name)) || !user.roles.some(r => r.role.permissions.some(p => p.permission.key === permission))) throw new HttpError("Anda tidak memiliki izin untuk operasi ini", 403);
}
