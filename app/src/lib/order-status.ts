import { OrderStatus, PaymentStatus } from "@prisma/client";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Menunggu Pembayaran",
  PAID: "Dibayar",
  PROCESSING: "Diproses",
  PACKED: "Dikemas",
  SHIPPED: "Dikirim",
  DELIVERED: "Diterima",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
  REFUNDED: "Dikembalikan",
};

export function orderBadgeVariant(
  status: OrderStatus,
): "default" | "success" | "warning" | "info" | "destructive" | "muted" {
  switch (status) {
    case "PENDING_PAYMENT":
      return "warning";
    case "PAID":
    case "PROCESSING":
    case "PACKED":
      return "info";
    case "SHIPPED":
    case "DELIVERED":
      return "info";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "EXPIRED":
    case "REFUNDED":
      return "destructive";
    default:
      return "muted";
  }
}

/** Customer-facing payment progress, without altering the financial/order state machine. */
export function orderDisplayStatus(status: OrderStatus, paymentStatus?: PaymentStatus | null): string {
  if (status === "PENDING_PAYMENT") {
    if (paymentStatus === "WAITING_VERIFICATION") return "Menunggu Verifikasi Pembayaran";
    if (paymentStatus === "REJECTED") return "Bukti Pembayaran Ditolak";
  }
  if (status === "PAID" && paymentStatus === "PAID") return "Pembayaran Berhasil";
  if (status === "PROCESSING") return "Sedang Diproses";
  if (status === "SHIPPED") return "Dalam Pengiriman";
  return ORDER_STATUS_LABEL[status];
}

export function paymentDisplayStatus(status: PaymentStatus): string {
  switch (status) {
    case "WAITING_VERIFICATION": return "Menunggu Verifikasi Pembayaran";
    case "PENDING_PAYMENT": return "Menunggu Pembayaran";
    case "REJECTED": return "Bukti Pembayaran Ditolak";
    case "PAID": return "Pembayaran Berhasil";
    case "EXPIRED": return "Pembayaran Kedaluwarsa";
    case "REFUNDED": return "Pembayaran Dikembalikan";
  }
}
