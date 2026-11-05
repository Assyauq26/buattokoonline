import { PaymentStatus } from "@prisma/client";

/** Payment lifecycle, kept separate from order & shipment status. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING_PAYMENT: ["WAITING_VERIFICATION", "EXPIRED"],
  WAITING_VERIFICATION: ["PAID", "REJECTED", "EXPIRED"],
  REJECTED: ["WAITING_VERIFICATION", "EXPIRED"],
  PAID: ["REFUNDED"],
  REFUNDED: [],
  EXPIRED: [],
};

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
