import { prisma } from "@/lib/prisma";
import { OrderStatus, Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { canTransitionOrder } from "@/modules/orders/domain/state-machine";
import { releaseStock } from "@/modules/inventory/inventory.service";
import { canTransitionPayment } from "@/modules/payments/domain/state-machine";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { lockOrder, assertStaffPermission } from "./transaction-locks";
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
import { writeAudit } from "@/modules/audit/audit.service";
import { canExpireOrder } from "./expiry-policy";

const orderInclude = {
  items: true,
  address: true,
  payment: { include: { bankAccount: true, confirmations: { orderBy: { createdAt: "desc" } } } },
  shipment: { include: { events: { orderBy: { occurredAt: "asc" } } } },
  jntShipmentRequest: true,
  history: { orderBy: { createdAt: "asc" } },
  user: { select: { name: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

export function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true, payment: true, shipment: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderForUser(userId: string, id: string) {
  const order = await prisma.order.findFirst({
    where: { id, userId },
    include: orderInclude,
  });
  if (!order) throw new HttpError("Order tidak ditemukan", 404);
  return order;
}

export function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id }, include: orderInclude });
}

export function listOrdersAdmin(params: { status?: OrderStatus; search?: string } = {}) {
  return prisma.order.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { orderNumber: { contains: params.search, mode: "insensitive" } },
              { user: { email: { contains: params.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { items: true, payment: true, shipment: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Server-authoritative status transition with history + audit + inventory side effects. */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorId: string,
  note?: string,
  options: { source?: "shipment" } = {},
) {
  return prisma.$transaction(tx => transitionOrderInTransaction(tx, orderId, to, actorId, note, options));
}

/** Reuse the exact lifecycle logic within shipment's transaction, never a nested transaction. */
export async function transitionOrderInTransaction(
  tx: Prisma.TransactionClient, orderId: string, to: OrderStatus, actorId: string,
  note?: string, options: { source?: "shipment" } = {},
) {
  if (!Object.values(OrderStatus).includes(to)) throw new HttpError("Status order tidak valid", 422);
  if (to === "PAID" || to === "REFUNDED") throw new HttpError("Status pembayaran hanya boleh diubah melalui workflow finansial khusus", 409);
    if (options.source !== "shipment" && ["SHIPPED", "DELIVERED"].includes(to)) throw new HttpError("Status pengiriman harus diubah melalui workflow shipment", 409);
    if (!(actorId === "system" && to === "EXPIRED")) {
      if (options.source === "shipment" && !["PROCESSING", "SHIPPED", "DELIVERED"].includes(to)) throw new HttpError("Transisi shipment tidak valid", 409);
      await assertStaffPermission(tx, actorId, options.source === "shipment" ? PERMISSIONS.SHIPPING_UPDATE : PERMISSIONS.ORDER_UPDATE);
    }
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { variantId: "asc" } }, payment: true },
    });
    if (!order) throw new HttpError("Order tidak ditemukan", 404);
    if (order.status === to) return order;
    if ((to === "CANCELLED" || to === "EXPIRED") && order.payment?.status === "WAITING_VERIFICATION")
      throw new HttpError("Bukti transfer sedang diverifikasi; selesaikan pemeriksaan finansial sebelum menutup pesanan.", 409);
    if (to === "EXPIRED" && actorId === "system" && !canExpireOrder(order, new Date()))
      throw new HttpError("Pesanan belum aman untuk kedaluwarsa otomatis.", 409);
    if (["PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "COMPLETED"].includes(to) && (order.paymentStatus !== "PAID" || order.payment?.status !== "PAID")) throw new HttpError("Pembayaran belum terverifikasi", 409);
    if (order.payment) await assertNoActiveRefund(tx, order.payment.id);
    if (!canTransitionOrder(order.status, to)) {
      throw new HttpError(`Transisi ${order.status} -> ${to} tidak diizinkan`, 409);
    }

    // Release reserved stock on cancel/expire (before it becomes a sale).
    if (
      (to === "CANCELLED" || to === "EXPIRED") &&
      order.status === "PENDING_PAYMENT"
    ) {
      if (order.paymentStatus === "PAID" || order.payment?.status === "PAID") throw new HttpError("Order lunas memerlukan workflow cancellation finansial", 409);
      if (order.payment) {
        if (order.payment.status !== "EXPIRED" && !canTransitionPayment(order.payment.status, "EXPIRED")) throw new HttpError("Pembayaran tidak menerima cancellation", 409);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${order.payment.id} FOR UPDATE`);
        await tx.payment.update({ where: { id: order.payment.id }, data: { status: "EXPIRED" } });
      }
      for (const item of order.items) {
        await releaseStock(tx, item.variantId, item.quantity, order.orderNumber);
      }
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: to, ...((to === "CANCELLED" || to === "EXPIRED") ? { paymentStatus: "EXPIRED" as const } : {}) },
    });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: order.status, toStatus: to, note, createdBy: actorId },
    });
    await writeAudit(
      { userId: actorId === "system" ? null : actorId, action: "order.transition", entity: "Order", entityId: orderId, meta: { from: order.status, to } },
      tx,
    );
    return updated;
}

/** Expire pending orders past their deadline (used by checkout guard / cron). */
export async function expireStaleOrders(actorId = "system") {
  const stale = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      expiresAt: { lt: new Date() },
      paymentStatus: { in: ["PENDING_PAYMENT", "REJECTED"] },
      payment: { is: { status: { in: ["PENDING_PAYMENT", "REJECTED"] } } },
    },
    select: { id: true },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: 50,
  });
  let expired = 0;
  for (const o of stale) {
    try { await transitionOrder(o.id, "EXPIRED", actorId, "Kedaluwarsa otomatis"); expired++; }
    catch (error) { if (!(error instanceof HttpError && error.status === 409)) throw error; }
  }
  return expired;
}
