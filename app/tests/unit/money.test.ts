import { describe, it, expect } from "vitest";
import { formatIDR, effectivePrice, discountPercent } from "@/lib/money";

describe("money helpers", () => {
  it("formats rupiah", () => {
    expect(formatIDR(129000)).toBe("Rp 129.000");
    expect(formatIDR(0)).toBe("Rp 0");
  });

  it("computes effective price", () => {
    expect(effectivePrice(189000, 129000)).toBe(129000);
    expect(effectivePrice(189000, null)).toBe(189000);
    expect(effectivePrice(189000, 0)).toBe(189000);
    expect(effectivePrice(100000, 120000)).toBe(100000);
  });

  it("computes discount percent", () => {
    expect(discountPercent(189000, 129000)).toBe(32);
    expect(discountPercent(100000, null)).toBe(0);
  });
});
