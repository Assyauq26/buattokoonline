import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";

export const refundResolutionKey = (requestId: string) =>
  `refund-resolution:${requestId}`;
export async function activeRefund(
  tx: Prisma.TransactionClient,
  paymentId: string,
) {
  const events = await tx.paymentEvent.findMany({
    where: {
      paymentId,
      type: { in: ["REFUND_REQUESTED", "REFUND_CONFIRMED", "REFUND_DECLINED"] },
    },
  });
  return (
    events.find(
      (e) =>
        e.type === "REFUND_REQUESTED" &&
        !events.some((r) => r.externalId === refundResolutionKey(e.id)),
    ) ?? null
  );
}
export async function assertNoActiveRefund(
  tx: Prisma.TransactionClient,
  paymentId: string,
  options: { allowShipmentCancellation?: boolean } = {},
) {
  if (await activeRefund(tx, paymentId))
    throw new HttpError("Refund sedang ditinjau; fulfillment dibekukan", 409);
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { orderId: true },
  });
  const resolution = await tx.orderResolution.findFirst({
    where: {
      orderId: payment.orderId,
      state: { notIn: ["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"] },
    },
  });
  if (
    resolution &&
    !(
      options.allowShipmentCancellation &&
      resolution.kind === "CANCEL" &&
      ["REVIEW", "WAITING_SHIPMENT"].includes(resolution.state)
    )
  )
    throw new HttpError(
      "Pembatalan/retur atau refund aktif; selesaikan kasus sebelum melanjutkan pesanan",
      409,
    );
}

export const REFUNDABLE_ORDER_STATUSES = [
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;
