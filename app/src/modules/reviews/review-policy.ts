import { z } from "zod";
export const reviewInput = z
  .object({
    rating: z.preprocess(
      (value) =>
        typeof value === "string" && /^[1-5]$/.test(value.trim())
          ? Number(value)
          : value,
      z.number().int().min(1).max(5),
    ),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().min(3, "Ulasan minimal 3 karakter").max(2000),
  })
  .strict();
export function eligibleReviewOrder(order: {
  status: string;
  paymentStatus: string;
  payment: { status: string } | null;
}) {
  return (
    ["DELIVERED", "COMPLETED"].includes(order.status) &&
    order.paymentStatus === "PAID" &&
    order.payment?.status === "PAID"
  );
}
export function reviewDisplayName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return !first || /[@\d]/.test(first) ? "Pembeli" : first.slice(0, 30);
}
