import { prisma } from "@/lib/prisma";
import { DiscountType, OrderStatus, type Prisma } from "@prisma/client";

/** Cancelled or expired orders release their coupon reservation.
 * Refunded orders remain redeemed to prevent repeat-use abuse.
 */
export const NON_CONSUMING_COUPON_ORDER_STATUSES = [OrderStatus.CANCELLED, OrderStatus.EXPIRED];

export function couponReservationWhere(code: string, userId?: string): Prisma.OrderWhereInput {
  return {
    couponCode: code,
    status: { notIn: NON_CONSUMING_COUPON_ORDER_STATUSES },
    ...(userId ? { userId } : {}),
  };
}

/** Returns discount amount (integer Rupiah) for a coupon against a subtotal. */
export async function computeDiscount(
  code: string | undefined | null,
  subtotal: number,
  client: Prisma.TransactionClient = prisma,
  userId?: string,
): Promise<{ discount: number; code: string | null; reason?: string }> {
  if (!code) return { discount: 0, code: null };
  const coupon = await client.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) return { discount: 0, code: null, reason: "Kupon tidak valid" };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now)
    return { discount: 0, code: null, reason: "Kupon belum mulai berlaku" };
  if (coupon.expiresAt && coupon.expiresAt <= now)
    return { discount: 0, code: null, reason: "Kupon kedaluwarsa" };
  // A pending order holds a coupon slot, but cancellation/expiry releases it.
  // createOrder holds the Coupon row lock to serialize last-slot redemption.
  if (coupon.usageLimit != null) {
    const used = await client.order.count({ where: couponReservationWhere(coupon.code) });
    if (used >= coupon.usageLimit)
      return { discount: 0, code: null, reason: "Kuota kupon telah habis" };
  }
  if (coupon.perUserLimit != null) {
    if (!userId) return { discount: 0, code: null, reason: "Identitas pelanggan diperlukan" };
    const usedByCustomer = await client.order.count({ where: couponReservationWhere(coupon.code, userId) });
    if (usedByCustomer >= coupon.perUserLimit)
      return { discount: 0, code: null, reason: "Batas penggunaan kupon Anda telah tercapai" };
  }
  if (subtotal < coupon.minSpend)
    return { discount: 0, code: null, reason: "Belanja belum memenuhi minimum" };

  let discount =
    coupon.discountType === DiscountType.PERCENT
      ? Math.round((subtotal * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { discount, code: coupon.code };
}
