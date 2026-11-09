import "server-only";
import { prisma } from "@/lib/prisma";
import { lockOrder } from "@/modules/orders/transaction-locks";
import { trackJntOrder } from "@/infrastructure/shipping/jnt/official-transport";
import { historicJntConfig } from "./shipping-settings.service";
import {
  trackingOutcome,
  trackingTime,
  latestTracking,
  trackingCancellation,
} from "./jnt-tracking-policy";
import { closeFullyRefundedCancelledOrder } from "@/modules/orders/cancelled-refund-reconciliation";
import { writeAudit } from "@/modules/audit/audit.service";
import { HttpError } from "@/lib/response";

export async function syncJntTracking(
  orderId: string,
  daily = false,
  actorId?: string,
) {
  const snapshot = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { shipment: true, jntShipmentRequest: true },
  });
  const shipment = snapshot.shipment,
    request = snapshot.jntShipmentRequest;
  if (
    !shipment ||
    shipment.cancelledAt ||
    shipment.provider !== "jnt" ||
    !shipment.trackingNumber ||
    !(
      request?.state === "SUCCEEDED" ||
      (request?.state === "UNKNOWN" &&
        request.errorCode === "CANCELLATION_PENDING")
    ) ||
    shipment.trackingNumber !== request.awb
  )
    throw new HttpError("Resi aktif tidak tersedia", 409);
  if (
    daily &&
    (+shipment.updatedAt > Date.now() - 86400000 ||
      !["PACKED", "SHIPPED"].includes(snapshot.status))
  )
    return { skipped: true, events: [] };
  // Provider I/O deliberately happens outside a database transaction / order row lock.
  let result;
  try {
    const { config } = await historicJntConfig(
      snapshot.jntCheckoutRevisionId,
      prisma,
    );
    result = await trackJntOrder(
      shipment.trackingNumber,
      request.externalOrderId,
      config,
    );
  } catch {
    await prisma.shipment.updateMany({
      where: {
        id: shipment.id,
        cancelledAt: null,
        order: {
          jntShipmentRequest: {
            OR: [
              { state: "SUCCEEDED" },
              { state: "UNKNOWN", errorCode: "CANCELLATION_PENDING" },
            ],
            externalOrderId: request.externalOrderId,
            awb: shipment.trackingNumber,
          },
        },
      },
      data: {
        updatedAt: new Date(),
        notes:
          "Tracking terakhir gagal; status paket dipertahankan. Coba kembali nanti.",
      },
    });
    return { failed: true, events: [] };
  }
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shipment: true, jntShipmentRequest: true, payment: true },
    });
    const current = order.shipment,
      req = order.jntShipmentRequest;
    // A response arriving after cancellation/replacement cannot mutate the new shipment.
    if (
      !current ||
      current.id !== shipment.id ||
      current.cancelledAt ||
      !(
        req?.state === "SUCCEEDED" ||
        (req?.state === "UNKNOWN" && req.errorCode === "CANCELLATION_PENDING")
      ) ||
      req.externalOrderId !== request.externalOrderId ||
      current.trackingNumber !== shipment.trackingNumber
    )
      return { skipped: true, events: [] };
    const latest = latestTracking(result.events),
      outcome = trackingOutcome(result.events);
    for (const e of result.events) {
      const occurredAt = trackingTime(e.time);
      if (!occurredAt) continue;
      const description =
        [e.status, e.note].filter(Boolean).join(" · ") ||
        "Pembaruan pengiriman J&T";
      if (
        !(await tx.shipmentEvent.findFirst({
          where: { shipmentId: current.id, description, occurredAt },
          select: { id: true },
        }))
      )
        await tx.shipmentEvent.create({
          data: {
            shipmentId: current.id,
            description,
            occurredAt,
            status:
              e.code === "200"
                ? "DELIVERED"
                : e.code === "100"
                  ? "IN_TRANSIT"
                  : current.status,
          },
        });
    }
    const cancelledAt = trackingCancellation(result.events);
    // Equality intentionally heals events persisted by older code without their terminal meaning.
    if (
      cancelledAt &&
      (!current.carrierEventAt || +cancelledAt >= +current.carrierEventAt)
    ) {
      await tx.jntShipmentRequest.update({
        where: { orderId },
        data: { state: "CANCELLED", errorCode: null },
      });
      await tx.shipment.update({
        where: { id: current.id },
        data: {
          cancelledAt,
          carrierEventAt: cancelledAt,
          notes:
            "Pembatalan resi dikonfirmasi tracking J&T. Pesanan dan dana ditangani terpisah.",
        },
      });
      await writeAudit(
        {
          userId: actorId || null,
          action: "jnt.cancel.tracking-confirmed",
          entity: "Order",
          entityId: orderId,
          meta: {
            externalOrderId: req.externalOrderId,
            shipmentId: current.id,
          },
        },
        tx,
      );
      const closed = await closeFullyRefundedCancelledOrder(
        tx,
        orderId,
        actorId,
      );
      return {
        ...result,
        failed: false,
        cancelled: true,
        orderClosed: closed.closed,
      };
    }
    const unambiguous =
      !!latest &&
      !result.events.some(
        (e) =>
          trackingTime(e.time)?.getTime() === latest.time.getTime() &&
          e.code !== latest.event.code,
      );
    const newer =
      unambiguous &&
      !!latest &&
      (!current.carrierEventAt || +latest.time > +current.carrierEventAt);
    let status = current.status,
      condition = current.carrierCondition;
    if (newer) {
      condition =
        latest.event.code === "401"
          ? "RETURNING"
          : latest.event.code === "402"
            ? "RETURNED"
            : ["150", "151", "152"].includes(latest.event.code || "")
              ? "ISSUE"
              : "NONE";
    }
    // Preserve confirmed physical status even when an active refund freezes order completion.
    if (newer && outcome && current.status !== "DELIVERED") status = outcome;
    const effectiveOutcome =
      newer && outcome
        ? outcome
        : current.carrierEventAt &&
            ["IN_TRANSIT", "DELIVERED"].includes(current.status)
          ? current.status
          : null;
    if (
      effectiveOutcome &&
      ["PACKED", "SHIPPED"].includes(order.status) &&
      ["PAID", "REFUNDED"].includes(order.paymentStatus) &&
      order.payment?.status === order.paymentStatus
    ) {
      // Carrier movement is physical truth. Financial holds block completion,
      // never tracking, and this path cannot mark an order COMPLETED.
      let from = order.status;
      const targets: ("SHIPPED" | "DELIVERED")[] = [
        ...(from === "PACKED" ? ["SHIPPED" as const] : []),
        ...(effectiveOutcome === "DELIVERED" ? ["DELIVERED" as const] : []),
      ];
      for (const to of targets) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: to },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: from,
            toStatus: to,
            createdBy: actorId || "system",
            note: "Status diperbarui dari tracking resmi J&T",
          },
        });
        from = to;
      }
      if (targets.length)
        await writeAudit(
          {
            userId: actorId || null,
            action: "jnt.tracking.transition",
            entity: "Order",
            entityId: orderId,
            meta: { from: order.status, to: from, shipmentId: current.id },
          },
          tx,
        );
    }
    await tx.shipment.update({
      where: { id: current.id },
      data: {
        status,
        carrierCondition: condition,
        updatedAt: new Date(),
        notes: "Tracking J&T berhasil diperbarui",
        ...(newer ? { carrierEventAt: latest.time } : {}),
        ...(status !== "PENDING" && !current.shippedDate
          ? { shippedDate: latest?.time || new Date() }
          : {}),
      },
    });
    return { ...result, failed: false };
  });
}
export async function syncDailyJntTracking() {
  const due = await prisma.shipment.findMany({
    where: {
      provider: "jnt",
      cancelledAt: null,
      status: { in: ["PENDING", "SHIPPED", "IN_TRANSIT"] },
      updatedAt: { lte: new Date(Date.now() - 86400000) },
      order: {
        status: { in: ["PACKED", "SHIPPED"] },
        jntShipmentRequest: {
          OR: [
            { state: "SUCCEEDED" },
            { state: "UNKNOWN", errorCode: "CANCELLATION_PENDING" },
          ],
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: 1,
    select: { orderId: true },
  });
  let updated = 0,
    failed = 0;
  for (const row of due) {
    try {
      const result = await syncJntTracking(row.orderId, true);
      if ("failed" in result && result.failed) failed++;
      else updated++;
    } catch {
      failed++;
    }
  }
  return { updated, failed, batch: due.length };
}
