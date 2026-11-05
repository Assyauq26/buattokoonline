import { describe, expect, it } from "vitest";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { orderDisplayStatus, paymentDisplayStatus } from "../../src/lib/order-status";

describe("order/payment progress labels", () => {
  it("shows review progress without pretending that the order has been paid", () => {
    expect(orderDisplayStatus(OrderStatus.PENDING_PAYMENT, PaymentStatus.WAITING_VERIFICATION)).toBe("Menunggu Verifikasi Pembayaran");
    expect(orderDisplayStatus(OrderStatus.PENDING_PAYMENT, PaymentStatus.REJECTED)).toBe("Bukti Pembayaran Ditolak");
    expect(orderDisplayStatus(OrderStatus.PENDING_PAYMENT, PaymentStatus.PENDING_PAYMENT)).toBe("Menunggu Pembayaran");
    expect(orderDisplayStatus(OrderStatus.PAID, PaymentStatus.PAID)).toBe("Pembayaran Berhasil");
  });

  it("shows localized labels for financial verification states", () => {
    expect(paymentDisplayStatus(PaymentStatus.WAITING_VERIFICATION)).toBe("Menunggu Verifikasi Pembayaran");
    expect(paymentDisplayStatus(PaymentStatus.PAID)).toBe("Pembayaran Berhasil");
  });
});


it.each([
 [OrderStatus.PENDING_PAYMENT, PaymentStatus.PENDING_PAYMENT, 'Menunggu Pembayaran'],
 [OrderStatus.PENDING_PAYMENT, PaymentStatus.WAITING_VERIFICATION, 'Menunggu Verifikasi Pembayaran'],
 [OrderStatus.PENDING_PAYMENT, PaymentStatus.REJECTED, 'Bukti Pembayaran Ditolak'],
 [OrderStatus.PAID, PaymentStatus.PAID, 'Pembayaran Berhasil'],
 [OrderStatus.PROCESSING, PaymentStatus.PAID, 'Sedang Diproses'],
 [OrderStatus.SHIPPED, PaymentStatus.PAID, 'Dalam Pengiriman'],
] as const)('preserves financial state while presenting %s/%s', (order, payment, label) => {
 expect(orderDisplayStatus(order, payment)).toBe(label);
});
