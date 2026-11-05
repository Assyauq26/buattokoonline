import { OrderStatus, PaymentStatus, ShipmentStatus } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { canTransitionShipment } from "./shipment.validation";
export type ShipmentContext = { status: OrderStatus; paymentStatus: PaymentStatus; paymentStatusActual?: PaymentStatus; shipmentStatus: ShipmentStatus | null };
/** Shared by the writer and server-rendered action options; no client lifecycle engine. */
export function shipmentOrderTarget(order: ShipmentContext, status: ShipmentStatus) {
    const refundedTracking = order.status === "REFUNDED" && order.paymentStatus === "REFUNDED" && order.paymentStatusActual === "REFUNDED" && order.shipmentStatus && ["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(order.shipmentStatus) && ["IN_TRANSIT", "DELIVERED"].includes(status);
    if (!refundedTracking && (order.paymentStatus !== "PAID" || order.paymentStatusActual !== "PAID" || !["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status))) throw new HttpError("Shipment hanya untuk order lunas yang aktif", 409);
        if (!canTransitionShipment(order.shipmentStatus, status)) throw new HttpError("Transisi shipment tidak valid", 409);
    let target: "PROCESSING" | "SHIPPED" | "DELIVERED" | null = null;
    if (!refundedTracking) {
    if (status === "PENDING" && !["PAID", "PROCESSING", "PACKED"].includes(order.status)) throw new HttpError("Shipment pending tidak sesuai status order", 409);
    if (status === "PROCESSING") {
      if (!["PAID", "PROCESSING", "PACKED"].includes(order.status)) throw new HttpError("Shipment processing tidak sesuai status order", 409);
      if (order.status === "PAID") target = "PROCESSING";
    }
    if (status === "SHIPPED" || status === "IN_TRANSIT") {
      if (!["PACKED", "SHIPPED"].includes(order.status)) throw new HttpError("Order harus packed sebelum dikirim", 409);
      if (status === "IN_TRANSIT" && order.status !== "SHIPPED") throw new HttpError("Order belum dikirim", 409);
      target = "SHIPPED";
    }
    if (status === "DELIVERED") {
      if (!["SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status)) throw new HttpError("Order belum dikirim", 409);
      if (order.status !== "COMPLETED") target = "DELIVERED";
    }
    }
    return target;
}
export function manualShipmentOptions(order: ShipmentContext) {
  return Object.values(ShipmentStatus).filter(status => { try { shipmentOrderTarget(order, status); return true; } catch { return false; } });
}
