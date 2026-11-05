"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { approvePayment, rejectPayment } from "@/modules/payments/payments.service";
import { upsertManualShipment } from "@/modules/shipping/shipping.service";
import { transitionOrder } from "@/modules/orders/orders.service";
import { ShipmentStatus, OrderStatus } from "@prisma/client";

export async function approvePaymentAction(paymentId: string) {
  return runAction(async () => {
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    const res = await approvePayment(paymentId, admin.id);
    revalidatePath("/admin/payments");
    revalidatePath("/admin/orders");
    return res;
  });
}

export async function rejectPaymentAction(_prev: unknown, formData: FormData) {
  const paymentId = String(formData.get("paymentId") || "");
  const reason = String(formData.get("reason") || "");
  const res = await runAction(async () => {
    const admin = await requirePermission(PERMISSIONS.PAYMENT_VERIFY);
    const r = await rejectPayment(paymentId, admin.id, reason);
    revalidatePath("/admin/payments");
    return r;
  });
  return res;
}

const shipmentSchema = z.object({
  orderId: z.string().min(1),
  courier: z.string().min(1),
  service: z.string().min(1),
  cost: z.coerce.number().int().nonnegative(),
  trackingNumber: z.string().optional(),
  shippedDate: z.string().optional(),
  estimatedDelivery: z.string().optional(),
  status: z.nativeEnum(ShipmentStatus),
  notes: z.string().optional(),
  requestId: z.string().uuid().optional(),
});

export async function upsertShipmentAction(_prev: unknown, formData: FormData) {
  const parsed = shipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: "Data pengiriman tidak lengkap" };
  const d = parsed.data;
  const res = await runAction(async () => {
    const admin = await requirePermission(PERMISSIONS.SHIPPING_UPDATE);
    await upsertManualShipment(d.orderId, admin.id, {
      courier: d.courier,
      service: d.service,
      cost: d.cost,
      trackingNumber: d.trackingNumber || undefined,
      shippedDate: d.shippedDate ? new Date(d.shippedDate) : null,
      estimatedDelivery: d.estimatedDelivery ? new Date(d.estimatedDelivery) : null,
      status: d.status,
      notes: d.notes,
      requestId: d.requestId,
    });
    return { ok: true };
  });
  revalidatePath("/admin/shipping");
  revalidatePath("/admin/orders");
  return res;
}

export async function transitionOrderAction(orderId: string, to: OrderStatus) {
  return runAction(async () => {
    const admin = await requirePermission(PERMISSIONS.ORDER_UPDATE);
    await transitionOrder(orderId, to, admin.id);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  });
}
