import "server-only";
import { createHash } from "node:crypto";
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
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
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
      ![
        "PAID",
        "PROCESSING",
        "PACKED",
        "SHIPPED",
        "DELIVERED",
        "COMPLETED",
      ].includes(snapshot.status))
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
  return prisma.$transaction(
    async (tx) => {
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
        ) {
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
          // Receipt time is the audit row's createdAt; occurrence time remains the carrier's timestamp.
          await writeAudit(
            {
              userId: actorId || null,
              action: "jnt.tracking.event-received",
              entity: "Shipment",
              entityId: current.id,
              meta: {
                code: e.code,
                occurredAt: occurredAt.toISOString(),
                receivedAt: new Date().toISOString(),
              },
            },
            tx,
          );
        }
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
      if (current.carrierCondition === "RETURNED") condition = "RETURNED";
      else if (
        current.carrierCondition === "RETURNING" &&
        condition !== "RETURNED"
      )
        condition = "RETURNING";
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
        ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(
          order.status,
        ) &&
        !["RETURNING", "RETURNED"].includes(condition) &&
        ["PAID", "REFUNDED"].includes(order.paymentStatus) &&
        order.payment?.status === order.paymentStatus
      ) {
        // Carrier movement is physical truth. Financial holds block completion,
        // never physical tracking. Completion is a separate transition after the financial hold check.
        let from = order.status;
        const targets: ("SHIPPED" | "DELIVERED" | "COMPLETED")[] = [
          ...(["PAID", "PROCESSING", "PACKED"].includes(from)
            ? ["SHIPPED" as const]
            : []),
          ...(effectiveOutcome === "DELIVERED" && from !== "DELIVERED"
            ? ["DELIVERED" as const]
            : []),
        ];
        if (
          effectiveOutcome === "DELIVERED" &&
          latest?.event.code === "200" &&
          (!current.carrierEventAt ||
            +latest.time >= +current.carrierEventAt) &&
          !["RETURNING", "RETURNED"].includes(condition)
        ) {
          let held = false;
          if (order.payment) {
            try {
              await assertNoActiveRefund(tx, order.payment.id);
            } catch (e) {
              if (e instanceof HttpError && e.status === 409) held = true;
              else throw e;
            }
          }
          if (!held && order.paymentStatus === "PAID")
            targets.push("COMPLETED");
        }
        for (const to of targets) {
          if (to === "SHIPPED" || to === "COMPLETED")
            await tx.notification.create({
              data: {
                userId: order.userId,
                type: "shipping",
                title: to === "SHIPPED" ? "Pesanan dikirim" : "Pesanan selesai",
                body: `Pesanan ${order.orderNumber}: ${to === "SHIPPED" ? "paket diterima kurir" : "paket diterima penerima berdasarkan tracking J&T"}.`,
              },
            });
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
      // A confirmed post-delivery return opens a non-financial review case once.
      // No refund, transfer, approval or restock is implied by the carrier event.
      if (
        latest &&
        unambiguous &&
        ["401", "402"].includes(latest.event.code || "") &&
        (!current.carrierEventAt || +latest.time >= +current.carrierEventAt) &&
        (["DELIVERED", "COMPLETED"].includes(order.status) ||
          current.status === "DELIVERED") &&
        order.paymentStatus === "PAID" &&
        order.payment?.status === "PAID"
      ) {
        const requestKey = `carrier-return:${req.externalOrderId}`;
        const existing = await tx.orderResolution.findFirst({
          where: {
            orderId,
            OR: [
              { requestKey },
              {
                state: {
                  notIn: ["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"],
                },
              },
            ],
          },
        });
        if (!existing) {
          const resolution = await tx.orderResolution.create({
            data: {
              orderId,
              requestKey,
              fingerprint: createHash("sha256")
                .update(requestKey)
                .digest("hex"),
              kind: "RETURN",
              state: "REVIEW",
              reason:
                "Retur setelah pengantaran dikonfirmasi tracking J&T; perlu pemeriksaan seller.",
              refundAmount: 0,
              productsAmount: 0,
              shippingAmount: 0,
              items: [],
              createdBy: actorId || "system",
              events: {
                create: {
                  action: "carrier-return",
                  actorId: actorId || "system",
                  note: "Kasus pemeriksaan dibuat dari tracking resmi. Tidak ada refund atau perubahan stok.",
                },
              },
            },
          });
          await writeAudit(
            {
              userId: actorId || null,
              action: "jnt.return.review-opened",
              entity: "Order",
              entityId: orderId,
              meta: {
                resolutionId: resolution.id,
                externalOrderId: req.externalOrderId,
                occurredAt: latest.time.toISOString(),
              },
            },
            tx,
          );
        }
      }
      if (
        newer &&
        ["RETURNING", "RETURNED"].includes(condition) &&
        condition !== current.carrierCondition
      )
        await tx.notification.create({
          data: {
            userId: order.userId,
            type: "shipping",
            title: "Pembaruan retur",
            body: `Pesanan ${order.orderNumber}: ${condition === "RETURNED" ? "paket diterima seller menurut kurir; pemeriksaan barang tetap diperlukan" : "paket dalam perjalanan kembali"}.`,
          },
        });
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
    },
    { timeout: 18000 },
  );
}
export async function syncDailyJntTracking() {
  const due = await prisma.shipment.findMany({
    where: {
      provider: "jnt",
      cancelledAt: null,
      status: { in: ["PENDING", "SHIPPED", "IN_TRANSIT", "DELIVERED"] },
      updatedAt: { lte: new Date(Date.now() - 86400000) },
      order: {
        OR: [
          {
            status: {
              in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"],
            },
          },
          {
            status: "COMPLETED",
            OR: [
              {
                history: {
                  some: {
                    toStatus: "DELIVERED",
                    createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
                  },
                },
              },
              {
                resolutions: {
                  some: {
                    state: {
                      notIn: ["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"],
                    },
                  },
                },
              },
            ],
          },
        ],
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
