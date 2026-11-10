import { orderFlow, type FlowOrder } from "@/modules/orders/flow-state";
export const customerTabs = [
  { key: "all", label: "Semua" },
  { key: "unpaid", label: "Belum bayar" },
  { key: "process", label: "Diproses" },
  { key: "shipped", label: "Dikirim" },
  { key: "done", label: "Selesai" },
  { key: "return", label: "Retur" },
  { key: "cancelled", label: "Dibatalkan" },
] as const;
export function customerOrderGroup(o: FlowOrder) {
  const flow = orderFlow(o);
  if (flow.key === "payment")
    return o.paymentStatus === "WAITING_VERIFICATION" ? "process" : "unpaid";
  if (["ready", "packing", "pickup"].includes(flow.key)) return "process";
  return flow.key;
}
export function customerCanPay(
  o: {
    status: string;
    paymentStatus: string;
    expiresAt: Date | null;
    payment?: { status: string } | null;
  },
  now = new Date(),
) {
  return (
    o.status === "PENDING_PAYMENT" &&
    !!o.payment &&
    (o.payment.status === "REJECTED" ||
      (o.payment.status === "PENDING_PAYMENT" &&
        o.paymentStatus === "PENDING_PAYMENT" &&
        (!o.expiresAt || o.expiresAt > now)))
  );
}
