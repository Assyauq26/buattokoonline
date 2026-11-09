import "server-only";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/modules/audit/audit.service";
import { hasCarrierMovement } from "@/modules/shipping/jnt-cancellation-policy";

/** Caller holds Order lock. Never transfers money, changes a refund, or restores stock. */
export async function closeFullyRefundedCancelledOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  actorId?: string,
) {
  const o = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payment: true,
      shipment: { include: { events: { select: { status: true } } } },
      jntShipmentRequest: true,
      resolutions: {
        select: {
          state: true,
          refundAmount: true,
          transfer: { select: { amount: true } },
        },
      },
    },
  });
  if (
    !["PAID", "PROCESSING", "PACKED"].includes(o.status) ||
    o.paymentStatus !== "REFUNDED" ||
    o.payment?.status !== "REFUNDED" ||
    o.payment.amount !== o.total ||
    o.total <= 0 ||
    o.shipment?.provider !== "jnt" ||
    !o.shipment.cancelledAt ||
    o.jntShipmentRequest?.state !== "CANCELLED" ||
    !o.shipment.trackingNumber ||
    o.shipment.trackingNumber !== o.jntShipmentRequest.awb ||
    hasCarrierMovement(o.shipment) ||
    !!o.shipment.shippedDate ||
    o.shipment.events.some((e) => hasCarrierMovement(e)) ||
    o.resolutions.some(
      (c) => !["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"].includes(c.state),
    ) ||
    o.resolutions.some(
      (c) => c.state === "RECEIVED" && c.transfer?.amount !== c.refundAmount,
    ) ||
    o.resolutions
      .filter((c) => c.state === "RECEIVED")
      .reduce((sum, c) => sum + c.refundAmount, 0) !== o.total
  ) {
    return { closed: false };
  }
  await tx.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: o.status,
      toStatus: "CANCELLED",
      createdBy: actorId || "system",
      note: "Resi dibatalkan J&T dan refund penuh telah dikonfirmasi pembeli. Tidak ada transfer atau perubahan stok tambahan.",
    },
  });
  await writeAudit(
    {
      userId: actorId || null,
      action: "order.cancel.refund-reconciled",
      entity: "Order",
      entityId: orderId,
      meta: {
        from: o.status,
        to: "CANCELLED",
        externalOrderId: o.jntShipmentRequest.externalOrderId,
      },
    },
    tx,
  );
  return { closed: true };
}
