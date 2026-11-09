import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";
import {
  discountedLines,
  lineRefund,
  fulfillmentLabel,
} from "@/modules/orders/resolution-policy";
import { sealRefundBank, openRefundBank } from "@/modules/orders/refund-bank";
describe("resolution snapshot policy", () => {
  it("allocates every discount rupiah and partial quantity without rounding overspend", () => {
    const lines = discountedLines(
      [
        { id: "b", lineTotal: 2000000000, quantity: 3 },
        { id: "a", lineTotal: 147483647, quantity: 2 },
      ],
      2147483646,
    );
    expect(lines.reduce((n, i) => n + i.net, 0)).toBe(1);
    for (const i of lines)
      expect(
        Array.from({ length: i.quantity }, (_, n) =>
          lineRefund(i.net, i.quantity, n, 1),
        ).reduce((a, b) => a + b, 0),
      ).toBe(i.net);
  });
  it("rejects duplicate budget quantities and invalid snapshots", () => {
    expect(() => lineRefund(100, 2, 1, 2)).toThrow();
    expect(() =>
      discountedLines([{ id: "a", lineTotal: 99, quantity: 1 }], 100),
    ).toThrow();
  });
  it("separates seller statement from physical carrier confirmation", () => {
    expect(
      fulfillmentLabel({ requestState: "SUCCEEDED", sellerHandoverAt: true }),
    ).toBe("Penyerahan dicatat seller");
    expect(fulfillmentLabel({ requestState: "CANCELLED" })).toBe(
      "Perlu pengiriman baru",
    );
  });
  it("encrypts bank details, binds case identity and rejects tampering", () => {
    process.env.ORDER_DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const data = { bank: "Test", number: "123456", holder: "Buyer" },
      v = sealRefundBank(data, "case1");
    expect(openRefundBank(v, "case1")).toEqual(data);
    expect(() => openRefundBank(v, "case2")).toThrow();
    expect(() => openRefundBank(v.slice(0, -4) + "AAAA", "case1")).toThrow();
  });
});
