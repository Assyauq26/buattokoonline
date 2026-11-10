import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  assertStaffPermission,
  lockOrder,
} from "@/modules/orders/transaction-locks";
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
import { writeAudit } from "@/modules/audit/audit.service";
import { historicJntConfig } from "./shipping-settings.service";
import { getVerifiedJntDistrict } from "@/infrastructure/shipping/jnt/verified-mapping";
import { checkJntRate } from "@/infrastructure/shipping/jnt/official-transport";
import type { Prisma } from "@prisma/client";

export const shippingReviewInput = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    recipientName: z.string().trim().min(1).max(30),
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+62|62|0)\d{8,12}$/),
    line: z.string().trim().min(5).max(150),
    village: z.string().trim().max(60),
    weightGram: z.number().int().min(1).max(100000),
    approvedRate: z.number().int().positive().optional(),
  })
  .strict();
type Order = Prisma.OrderGetPayload<{
  include: {
    address: true;
    payment: true;
    shipment: true;
    jntShipmentRequest: true;
  };
}>;
const include = {
  address: true,
  payment: true,
  shipment: true,
  jntShipmentRequest: true,
} as const;
export function shippingFingerprint(o: {
  address: unknown;
  shippingWeightGram: number | null;
  shippingService: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([o.address, o.shippingWeightGram, o.shippingService]),
    )
    .digest("hex");
}
function editable(o: Order) {
  if (
    !["PROCESSING", "PACKED"].includes(o.status) ||
    o.paymentStatus !== "PAID" ||
    o.payment?.status !== "PAID" ||
    o.shippingMode !== "official" ||
    !o.address?.districtCode
  )
    throw new HttpError("Pengiriman ini tidak dapat diubah", 409);
  // Once an attempt exists its payload is immutable, including uncertain/rejected attempts.
  if (o.jntShipmentRequest || o.shipment)
    throw new HttpError(
      "Resi sudah pernah diproses. Selesaikan rekonsiliasi sebelum mengubah pengiriman.",
      409,
    );
}
export async function reviseShipping(
  orderId: string,
  actorId: string,
  value: unknown,
  save: boolean,
) {
  const input = shippingReviewInput.parse(value);
  const initial = await prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.SHIPPING_CREATE);
    const o = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include,
    });
    editable(o);
    await assertNoActiveRefund(tx, o.payment!.id);
    if (shippingFingerprint(o) !== input.fingerprint)
      throw new HttpError(
        "Data telah berubah. Tutup lalu buka kembali rincian pengiriman.",
        409,
      );
    return o;
  });
  const { config, mappingVersion } = await historicJntConfig(
    initial.jntCheckoutRevisionId,
    prisma,
  );
  const map = await getVerifiedJntDistrict(
    initial.address!.districtCode!,
    mappingVersion,
  );
  // Rate lookup is read-only and deliberately outside the order lock.
  const rates = await checkJntRate(
    {
      originSite: config.seller!.warehouse.originSite,
      destinationArea: map.destAreaCode!,
      weightGram: input.weightGram,
      productType: initial.shippingService as "EZ" | "HBO" | "JND" | "JSD",
    },
    config,
  );
  const rate = rates.find((r) => r.service === initial.shippingService);
  if (!rate)
    throw new HttpError("Layanan pesanan tidak tersedia untuk berat ini", 422);
  if (!save) return { rate: rate.cost, charged: initial.shippingCost };
  if (input.approvedRate !== rate.cost)
    throw new HttpError(
      "Tarif berubah. Periksa kembali tarif sebelum menyimpan.",
      409,
    );
  return prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.SHIPPING_CREATE);
    await lockOrder(tx, orderId);
    const current = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include,
    });
    editable(current);
    await assertNoActiveRefund(tx, current.payment!.id);
    if (shippingFingerprint(current) !== input.fingerprint)
      throw new HttpError(
        "Data pengiriman telah berubah. Muat ulang sebelum menyimpan.",
        409,
      );
    await tx.orderAddress.update({
      where: { orderId },
      data: {
        recipientName: input.recipientName,
        phone: input.phone,
        line: input.line,
        village: input.village,
      },
    });
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { shippingWeightGram: input.weightGram },
      include: { address: true },
    });
    await writeAudit(
      {
        userId: actorId,
        action: "shipping.review.updated",
        entity: "Order",
        entityId: orderId,
        meta: {
          before: input.fingerprint,
          after: shippingFingerprint(updated),
          weightGram: input.weightGram,
          validatedRate: rate.cost,
          charged: current.shippingCost,
          sellerAcceptsDifference: rate.cost !== current.shippingCost,
        },
      },
      tx,
    );
    return {
      fingerprint: shippingFingerprint(updated),
      rate: rate.cost,
      charged: current.shippingCost,
    };
  });
}
