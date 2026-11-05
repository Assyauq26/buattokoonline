import { shipmentOrderTarget } from "./shipping-policy";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ShipmentStatus } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { transitionOrderInTransaction } from "@/modules/orders/orders.service";
import { assertStaffPermission, lockOrder } from "@/modules/orders/transaction-locks";
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
import { manualShipmentSchema } from "./shipment.validation";

/** Manual recording only: no external carrier API or remote dispatch inside this transaction. */
export async function upsertManualShipment(orderId: string, adminId: string, value: {
  courier: string; service: string; cost: number; status: ShipmentStatus;
  trackingNumber?: string; shippedDate?: Date | null; estimatedDelivery?: Date | null;
  notes?: string; requestId?: string;
}) {
  const input = manualShipmentSchema.parse(value);
  // Hash the submitted intent, before server-side status/date normalization, so
  // retries with the same requestId remain safe even when the order has advanced.
  const { requestId, ...requested } = input;
  const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const fingerprint = hash(requested);
  const auditId = requestId ? `shipreq_${hash([orderId, requestId]).slice(0, 40)}` : undefined;
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, adminId, PERMISSIONS.SHIPPING_UPDATE);
    await lockOrder(tx, orderId);
    if (auditId) {
      const previous = await tx.auditLog.findUnique({ where: { id: auditId } });
      if (previous) {
        const meta = previous.meta;
        if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta.fingerprint !== fingerprint) throw new HttpError("Request shipment digunakan untuk payload berbeda", 409);
        return tx.shipment.findUniqueOrThrow({ where: { orderId } });
      }
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, shipment: true } });
    if (!order.payment) throw new HttpError("Pembayaran tidak ditemukan", 409);
    if (order.shippingMode === "official" || order.shipment?.provider === "jnt") throw new HttpError("Order J&T resmi harus dikelola melalui alur API pengiriman, bukan form manual", 409);
    await assertNoActiveRefund(tx, order.payment.id);

    // Toko business rule: saving a tracking number for a PACKED order
    // attests courier handover. No separate "SHIPPED" selection is required.
    // Do not silently skip packing on a PAID/PROCESSING order.
    const enteredTracking = requested.trackingNumber?.trim();
    if (enteredTracking && ["PAID", "PROCESSING"].includes(order.status) &&
        enteredTracking !== order.shipment?.trackingNumber) {
      throw new HttpError("Ubah pesanan menjadi Dikemas sebelum memasukkan nomor resi", 409);
    }
    const replayOfDispatch = order.status === "SHIPPED" &&
      order.shipment?.status === "SHIPPED" && enteredTracking === order.shipment.trackingNumber;
    const autoDispatch = Boolean(enteredTracking) &&
      (order.status === "PACKED" || replayOfDispatch) &&
      ["PENDING", "PROCESSING", "SHIPPED"].includes(requested.status);
    const effectiveStatus: ShipmentStatus = autoDispatch ? "SHIPPED" : requested.status;
    const data = {
      ...requested,
      status: effectiveStatus,
      // The first dispatch uses server time; all later edits retain that exact
      // timestamp. Never trust a browser-supplied shippedDate for this audit field.
      shippedDate: order.shipment?.shippedDate ?? (effectiveStatus === "SHIPPED" ? new Date() : undefined),
    };
    const target = shipmentOrderTarget(
      { status: order.status, paymentStatus: order.paymentStatus,
        paymentStatusActual: order.payment.status, shipmentStatus: order.shipment?.status ?? null },
      effectiveStatus,
    );
    const merged = { ...order.shipment, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
    if (["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(effectiveStatus) && !merged.trackingNumber) {
      throw new HttpError("Nomor resi diperlukan sebelum pengiriman", 422);
    }
    const changed = !order.shipment || ["courier", "service", "cost", "status", "trackingNumber", "shippedDate", "estimatedDelivery", "notes"].some(key => {
      const before = (order.shipment as unknown as Record<string, unknown>)[key]; const after = (merged as Record<string, unknown>)[key];
      return (before instanceof Date ? before.toISOString() : before ?? null) !== (after instanceof Date ? after.toISOString() : after ?? null);
    });
    if (target) await transitionOrderInTransaction(tx, orderId, target, adminId, `Shipment: ${effectiveStatus}`, { source: "shipment" });
    const shipment = changed ? await tx.shipment.upsert({ where: { orderId }, create: { orderId, provider: "manual", ...data }, update: data }) : order.shipment!;
    if (changed) {
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: effectiveStatus, description: `Manual shipment: ${effectiveStatus}${merged.trackingNumber ? ` (${merged.trackingNumber})` : ""}` } });
      await writeAudit({ userId: adminId, action: "shipping.update", entity: "Shipment", entityId: shipment.id, meta: { orderId, status: effectiveStatus, autoDispatch: autoDispatch && requested.status !== effectiveStatus } }, tx);
    }
    if (auditId) await tx.auditLog.create({ data: { id: auditId, userId: adminId, action: "shipping.request", entity: "Shipment", entityId: shipment.id, meta: { orderId, fingerprint } } });
    return shipment;
  }, { timeout: 15000 });
}

export function getShipmentByOrder(orderId: string) {
  return prisma.shipment.findUnique({ where: { orderId }, include: { events: { orderBy: { occurredAt: "asc" } } } });
}
