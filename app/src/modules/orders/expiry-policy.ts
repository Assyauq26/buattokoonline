/** Never release a stock reservation while a submitted proof is awaiting review. */
export function canExpireOrder(order: {
  status: string;
  expiresAt: Date | null;
  paymentStatus: string;
  payment: { status: string } | null;
}, now = new Date()): boolean {
  return order.status === "PENDING_PAYMENT" &&
    order.expiresAt !== null && order.expiresAt <= now &&
    ["PENDING_PAYMENT", "REJECTED"].includes(order.paymentStatus) &&
    !!order.payment && ["PENDING_PAYMENT", "REJECTED"].includes(order.payment.status);
}
