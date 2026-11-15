import "server-only";
import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { commitSale } from "@/modules/inventory/inventory.service";
import { writeAudit } from "@/modules/audit/audit.service";

type LockedPayment = Prisma.PaymentGetPayload<{ include: { order: { include: { items: true } } } }>;

/** Internal shared commit only. Caller holds Order -> Payment locks, validates
 * its proof/evidence and permission in this SAME transaction. Never call a second
 * transaction to attach a claim after marking an order paid. */
export async function settlePaymentInTransaction(tx: Prisma.TransactionClient, payment: LockedPayment,
  actorId: string, note = "Pembayaran diverifikasi") {
  if (payment.order.status !== "PENDING_PAYMENT" || payment.status !== "WAITING_VERIFICATION")
    throw new HttpError("Pembayaran tidak lagi menunggu pemeriksaan", 409);
  const changed = await tx.payment.updateMany({ where: { id: payment.id, status: "WAITING_VERIFICATION" }, data: { status: "PAID" } });
  if (changed.count !== 1) throw new HttpError("Status pembayaran berubah", 409);
  for (const item of [...payment.order.items].sort((a,b) => a.variantId.localeCompare(b.variantId)))
    await commitSale(tx, item.variantId, item.quantity, payment.order.orderNumber);
  const order = await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" },
    data: { status: "PAID", paymentStatus: "PAID" } });
  if (order.count !== 1) throw new HttpError("Pesanan tidak menerima pembayaran", 409);
  await tx.orderStatusHistory.create({ data: { orderId: payment.orderId, fromStatus: payment.order.status,
    toStatus: "PAID", note, createdBy: actorId } });
  await tx.notification.create({ data: { userId: payment.order.userId, type: "payment",
    title: "Pembayaran dikonfirmasi", body: `Pembayaran untuk order ${payment.order.orderNumber} telah diverifikasi.` } });
  await writeAudit({ userId: actorId, action: "payment.approve", entity: "Payment", entityId: payment.id,
    meta: { orderId: payment.orderId } }, tx);
  return { ok: true };
}
