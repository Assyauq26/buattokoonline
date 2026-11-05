import { z } from "zod";

/** A confirmation, never a source of prices: compare with locked database values. */
export const checkoutLinesSchema = z.array(z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().positive().max(2_147_483_647),
  unitPrice: z.number().int().positive().max(2_147_483_647),
})).min(1).max(100).refine(lines => new Set(lines.map(l => l.variantId)).size === lines.length, "Varian duplikat");
export type CheckoutLines = z.infer<typeof checkoutLinesSchema>;

/** What the buyer saw and confirmed; never trusted as a source of prices. */
const rupiah = z.number().int().nonnegative().max(2_147_483_647);
export const checkoutQuoteSchema = z.object({
  subtotal: rupiah,
  shippingCost: rupiah,
  discount: rupiah,
  total: rupiah,
}).strict().refine(
  quote => quote.total === quote.subtotal + quote.shippingCost - quote.discount && quote.discount <= quote.subtotal,
  "Ringkasan harga tidak valid",
);
export type CheckoutQuoteConfirmation = z.infer<typeof checkoutQuoteSchema>;
export function checkoutSignature(lines: CheckoutLines) {
  return JSON.stringify(lines.map(({ variantId, quantity, unitPrice }) => ({ variantId, quantity, unitPrice })).sort((a, b) => a.variantId.localeCompare(b.variantId)));
}
