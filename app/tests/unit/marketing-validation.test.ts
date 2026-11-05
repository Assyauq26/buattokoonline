import { describe, expect, it } from "vitest";
import { voucherInputSchema } from "@/modules/promotions/marketing.validation";
import { activeScheduledFlashPrice, effectiveProductPrice } from "@/modules/promotions/scheduled-flash-sale";

const voucher = () => ({
  code: "GHEVER10", discountType: "PERCENT" as const,
  discountValue: 10, minSpend: 150000, maxDiscount: 25000,
  expiresAt: null, isActive: true,
});

describe("Marketing voucher input", () => {
  it("normalizes coupon codes and validates percentage and Rupiah", () => {
    expect(voucherInputSchema.parse({ ...voucher(), code: " ghever10 " }).code).toBe("GHEVER10");
    for (const discountValue of [0, -1, 1.2, 101, 2147483648, Infinity])
      expect(voucherInputSchema.safeParse({ ...voucher(), discountValue }).success).toBe(false);
    for (const code of ["A", "Hello world", "abc<script>", "../promo", "x".repeat(33)])
      expect(voucherInputSchema.safeParse({ ...voucher(), code }).success).toBe(false);
  });
  it("accepts valid fixed vouchers but rejects negative spend and empty caps", () => {
    expect(voucherInputSchema.safeParse({ ...voucher(), discountType: "FIXED", discountValue: 35000 }).success).toBe(true);
    expect(voucherInputSchema.safeParse({ ...voucher(), minSpend: -1 }).success).toBe(false);
    expect(voucherInputSchema.safeParse({ ...voucher(), maxDiscount: 0 }).success).toBe(false);
  });
  it("validates startsAt and usage limits", () => {
    expect(voucherInputSchema.safeParse({ ...voucher(), usageLimit: 1, perUserLimit: 1 }).success).toBe(true);
    for (const limit of [0, -1, 1.2, 1_000_001, Infinity]) {
      expect(voucherInputSchema.safeParse({ ...voucher(), usageLimit: limit }).success).toBe(false);
      expect(voucherInputSchema.safeParse({ ...voucher(), perUserLimit: limit }).success).toBe(false);
    }
    expect(voucherInputSchema.safeParse({
      ...voucher(), startsAt: "2030-01-02T00:00:00.000Z", expiresAt: "2030-01-01T00:00:00.000Z",
    }).success).toBe(false);
    expect(voucherInputSchema.safeParse({
      ...voucher(), startsAt: "2030-01-01T00:00:00.000Z", expiresAt: "2030-01-02T00:00:00.000Z",
    }).success).toBe(true);
  });
  it("prevents creating an already-expired active coupon", () => {
    expect(voucherInputSchema.safeParse({ ...voucher(), expiresAt: "2020-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(voucherInputSchema.safeParse({ ...voucher(), expiresAt: "2020-01-01T00:00:00.000Z", isActive: false }).success).toBe(true);
  });
});
describe("Campaign-only Flash Sale prices", () => {
  const fields={basePrice:150000,salePrice:120000,campaignPriceVerified:true,flashSalePrice:90000,flashSaleStartsAt:new Date("2030-01-01T12:00:00Z"),flashSaleEndsAt:new Date("2030-01-01T13:00:00Z")};
  it("uses start inclusive/end exclusive and preserves the regular effective price",()=>{
    expect(effectiveProductPrice(fields,new Date("2030-01-01T11:59:59Z"))).toBe(120000);
    expect(effectiveProductPrice(fields,new Date("2030-01-01T12:00:00Z"))).toBe(90000);
    expect(effectiveProductPrice(fields,new Date("2030-01-01T12:59:59Z"))).toBe(90000);
    expect(effectiveProductPrice(fields,new Date("2030-01-01T13:00:00Z"))).toBe(120000);
  });
  it("never trusts legacy per-product dates or an unverified overlay",()=>{
    expect(activeScheduledFlashPrice({...fields,campaignPriceVerified:false},new Date("2030-01-01T12:30:00Z"))).toBeNull();
    expect(activeScheduledFlashPrice({...fields,flashSalePrice:130000},new Date("2030-01-01T12:30:00Z"))).toBeNull();
    expect(activeScheduledFlashPrice({...fields,flashSaleEndsAt:null})).toBeNull();
  });
});
