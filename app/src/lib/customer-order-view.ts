import type { OrderStatus, PaymentStatus } from "@prisma/client";
export const customerTabs = [
  { key: "all", label: "Semua" },
  { key: "unpaid", label: "Belum bayar" },
  { key: "process", label: "Diproses" },
  { key: "shipped", label: "Dikirim" },
  { key: "done", label: "Selesai" },
  { key: "cancelled", label: "Dibatalkan" },
] as const;
export function customerOrderGroup(o: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}) {
  if (o.status === "PENDING_PAYMENT")
    return o.paymentStatus === "WAITING_VERIFICATION" ? "process" : "unpaid";
  if (["PAID", "PROCESSING", "PACKED"].includes(o.status)) return "process";
  if (o.status === "SHIPPED") return "shipped";
  if (["DELIVERED", "COMPLETED"].includes(o.status)) return "done";
  if (["CANCELLED", "REFUNDED"].includes(o.status)) return "cancelled";
  return "other";
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
