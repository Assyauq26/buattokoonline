import { describe, expect, it } from "vitest";
import {
  customerRefundView,
  maskBankNumber,
  customerRefundEvent,
} from "@/lib/customer-refund-view";
import { refundBankSchema } from "@/modules/orders/resolution-policy";
describe("customer refund presentation", () => {
  it.each([
    "REVIEW",
    "WAITING_PAYMENT",
    "WAITING_SHIPMENT",
    "REJECTED",
    "CANCELLED_NO_REFUND",
  ])("does not promise a refund for %s", (state) => {
    expect(customerRefundView({ state, refundAmount: 0 })).toMatchObject({
      approved: false,
      canEditBank: false,
      received: false,
    });
  });
  it("distinguishes bank saved, seller claim and customer receipt", () => {
    expect(
      customerRefundView({ state: "WAITING_BANK", refundAmount: 123 }),
    ).toMatchObject({ needsBank: true, canEditBank: true, received: false });
    expect(
      customerRefundView({ state: "READY", refundAmount: 123 }),
    ).toMatchObject({
      label: "Menunggu pengembalian dana",
      canEditBank: true,
      received: false,
    });
    expect(
      customerRefundView({ state: "TRANSFER_RECORDED", refundAmount: 123 }),
    ).toMatchObject({
      label: "Transfer dicatat penjual",
      canEditBank: false,
      received: false,
    });
    expect(
      customerRefundView({ state: "RECEIVED", refundAmount: 123 }),
    ).toMatchObject({ canEditBank: false, received: true });
  });
  it("keeps bank locked while transfer is in progress or disputed", () => {
    for (const state of [
      "TRANSFER_PENDING",
      "TRANSFER_RECORDED",
      "DISPUTED",
      "RECEIVED",
    ])
      expect(customerRefundView({ state, refundAmount: 123 }).canEditBank).toBe(
        false,
      );
  });
  it("does not mark a return as received or promise an unapproved refund", () => {
    expect(
      customerRefundView({ state: "WAITING_RETURN", refundAmount: 123 }),
    ).toMatchObject({ received: false, approved: true });
    expect(
      customerRefundView({ state: "REVIEW", refundAmount: 123 }),
    ).toMatchObject({ approved: false, canEditBank: false });
  });
  it("preserves long account numbers and leading zeros without numerical coercion", () => {
    const number = "000001234567890123456789012345";
    expect(
      refundBankSchema.parse({ bank: "Bank Demo", holder: "Nama Demo", number })
        .number,
    ).toBe(number);
    expect(maskBankNumber(number)).toBe("•••• 2345");
    for (const number of ["1234", "1e100", "123-456", "1".repeat(31)])
      expect(
        refundBankSchema.safeParse({ bank: "Bank", holder: "Nama", number })
          .success,
      ).toBe(false);
  });
  it("keeps transfer history distinct from receipt and avoids bank values in fixed event copy", () => {
    expect(customerRefundEvent("transfer-recorded", "old")).toBe(
      "Penjual mencatat transfer",
    );
    expect(customerRefundEvent("bank", "0012345678")).toBe(
      "Rekening pengembalian disimpan",
    );
  });
});
