import { orderFlow, type FlowOrder } from "@/modules/orders/flow-state";
export function whatsappOrderEvent(order: FlowOrder) {
  const resolution = order.resolutions?.find(
    (r) =>
      [
        "WAITING_BANK",
        "READY",
        "TRANSFER_PENDING",
        "TRANSFER_RECORDED",
        "DISPUTED",
      ].includes(r.state) && (r.refundAmount || 0) > 0,
  );
  if (resolution?.state === "TRANSFER_RECORDED") return "refund_recorded";
  if (resolution) return "refund_pending";
  const flow = orderFlow(order);
  const events: Record<string, string> = {
    cancelled: "cancelled",
    return: "returned",
    done: "delivered",
    shipped: "shipped",
    pickup: "awb_created",
    packing: "preparing",
    ready: "paid",
  };
  if (events[flow.key]) return events[flow.key];
  if (order.paymentStatus === "REJECTED") return "payment_revision";
  if (order.status === "PENDING_PAYMENT") return "created";
  return null;
}
