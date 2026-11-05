import { describe, it, expect } from "vitest";
import { checkoutLinesSchema, checkoutSignature } from "@/modules/checkout/checkout.validation";

describe("customer checkout price confirmation", () => {
  const line = { variantId: "variant-a", quantity: 1, unitPrice: 100000 };
  it("accepts integer Rupiah and positive quantities", () => expect(checkoutLinesSchema.safeParse([line]).success).toBe(true));
  it("rejects missing and empty confirmations", () => {
    expect(checkoutLinesSchema.safeParse(undefined).success).toBe(false);
    expect(checkoutLinesSchema.safeParse([]).success).toBe(false);
  });
  it("rejects duplicate variants", () => expect(checkoutLinesSchema.safeParse([line, line]).success).toBe(false));
  it("rejects negative, zero, fractional and overflowing amounts", () => {
    for (const unitPrice of [-1, 0, 1.5, 2_147_483_648]) expect(checkoutLinesSchema.safeParse([{ ...line, unitPrice }]).success).toBe(false);
  });
  it("rejects invalid quantities", () => {
    for (const quantity of [-1, 0, 1.5, 2_147_483_648]) expect(checkoutLinesSchema.safeParse([{ ...line, quantity }]).success).toBe(false);
  });
  it("compares per-variant prices and quantities independent of order", () => {
    const b = { ...line, variantId: "variant-b", unitPrice: 200000 };
    expect(checkoutSignature([line, b])).toBe(checkoutSignature([b, line]));
    expect(checkoutSignature([line, b])).not.toBe(checkoutSignature([{ ...line, unitPrice: 99999 }, b]));
    expect(checkoutSignature([line])).not.toBe(checkoutSignature([{ ...line, quantity: 2 }]));
  });
});
