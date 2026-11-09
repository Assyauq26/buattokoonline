import { z } from "zod";
export const terminalResolutionStates = [
  "RECEIVED",
  "REJECTED",
  "CANCELLED_NO_REFUND",
];
export const reasonSchema = z.string().trim().min(3).max(1500);
export const requestResolutionSchema = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum(["CANCEL", "RETURN"]),
    reason: reasonSchema,
  })
  .strict();
export const refundBankSchema = z
  .object({
    bank: z.string().trim().min(2).max(80),
    holder: z.string().trim().min(2).max(120),
    number: z
      .string()
      .trim()
      .regex(/^\d{5,30}$/),
  })
  .strict();
export const selectedItemsSchema = z
  .array(
    z
      .object({
        orderItemId: z.string().min(1).max(64),
        quantity: z.number().int().positive().max(100000),
      })
      .strict(),
  )
  .min(1)
  .max(100)
  .refine(
    (v) => new Set(v.map((i) => i.orderItemId)).size === v.length,
    "Item duplikat",
  );
export const resolutionCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prepare-transfer"),
      revision: z.number().int().nonnegative(),
      attested: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("confirm-cancel"),
      revision: z.number().int().nonnegative(),
      fundsReview: z.enum(["UNREVIEWED", "NOT_RECEIVED"]).default("UNREVIEWED"),
      attested: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve-return"),
      revision: z.number().int().nonnegative(),
      items: selectedItemsSchema,
      shippingAmount: z.number().int().nonnegative().max(2147483647),
      returnRequired: z.boolean(),
      policyReason: reasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("reject"),
      revision: z.number().int().nonnegative(),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("bank"),
      revision: z.number().int().nonnegative(),
      bank: refundBankSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("return-shipped"),
      revision: z.number().int().nonnegative(),
      tracking: z.string().trim().min(5).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("inspect-return"),
      revision: z.number().int().nonnegative(),
      restock: z.boolean(),
      attested: z.literal(true),
      note: reasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("received"),
      revision: z.number().int().nonnegative(),
      attested: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("dispute"),
      revision: z.number().int().nonnegative(),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("follow-up"),
      revision: z.number().int().nonnegative(),
      note: reasonSchema,
    })
    .strict(),
]);
/** Allocate every discount rupiah deterministically against immutable order lines. */
export function discountedLines(
  items: { id: string; lineTotal: number; quantity: number }[],
  discount: number,
) {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const subtotal = sorted.reduce((n, i) => n + i.lineTotal, 0);
  if (
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount > subtotal ||
    sorted.some(
      (i) =>
        !Number.isSafeInteger(i.lineTotal) ||
        i.lineTotal < 0 ||
        !Number.isSafeInteger(i.quantity) ||
        i.quantity < 1,
    )
  )
    throw new Error("Snapshot transaksi tidak valid");
  let allocated = 0,
    weight = 0;
  return sorted.map((i) => {
    weight += i.lineTotal;
    const cumulative = subtotal
      ? Number((BigInt(discount) * BigInt(weight)) / BigInt(subtotal))
      : 0;
    const net = i.lineTotal - (cumulative - allocated);
    allocated = cumulative;
    return { ...i, net };
  });
}
export function lineRefund(
  net: number,
  sold: number,
  previous: number,
  quantity: number,
) {
  if (
    !Number.isSafeInteger(previous) ||
    !Number.isSafeInteger(quantity) ||
    previous < 0 ||
    quantity < 1 ||
    previous + quantity > sold
  )
    throw new Error("Kuantitas refund melebihi pembelian");
  return Number(
    (BigInt(net) * BigInt(previous + quantity)) / BigInt(sold) -
      (BigInt(net) * BigInt(previous)) / BigInt(sold),
  );
}
export function fulfillmentLabel(input: {
  requestState?: string | null;
  errorCode?: string | null;
  cancelledAt?: unknown;
  sellerHandoverAt?: unknown;
  shipmentStatus?: string | null;
  carrierEventAt?: unknown;
}) {
  if (input.cancelledAt || input.requestState === "CANCELLED")
    return "Perlu pengiriman baru";
  if (input.requestState === "UNKNOWN")
    return input.errorCode === "CANCELLATION_PENDING"
      ? "Pembatalan menunggu kepastian"
      : "Pembuatan resi menunggu kepastian";
  if (["PREPARED", "DISPATCHED"].includes(input.requestState || ""))
    return "Pembuatan resi diproses";
  if (input.shipmentStatus === "DELIVERED") return "Terkirim";
  if (
    input.carrierEventAt &&
    ["IN_TRANSIT", "SHIPPED"].includes(input.shipmentStatus || "")
  )
    return "Dalam pengiriman";
  if (input.sellerHandoverAt || input.shipmentStatus === "SHIPPED")
    return "Penyerahan dicatat seller";
  if (input.requestState === "SUCCEEDED") return "Siap diserahkan";
  return "Belum ada pengiriman";
}
