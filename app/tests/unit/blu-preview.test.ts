import { expect, it } from "vitest";
import { recognizeBluPreview } from "@/modules/payments/evidence/blu-preview";

// Synthetic replacements. No names, account digits or transaction details copied
// from the owner's screenshot. Actual MIME/HTML and sender trust are NOT tested.
const fixture = {
  subject: "Info Transaksi Masuk ke blu Kamu 💸",
  text: "Hai Contoh,\nAda transaksi masuk ke rekening bluAccount kamu. Ini detailnya:\nNominal Transfer\nRp 125.001,00\nPENGIRIM UJI\nBCA\nPENERIMA UJI\nbluAccount\n0000 1111 2222\nTgl & Jam Transaksi\n13 Nov 2026 16:06:10 WIB\nTipe Transaksi\nBI-FAST",
};
it("recognizes screenshot-shaped text but cannot manufacture trust, stable ID or settled status", () => {
  expect(recognizeBluPreview(fixture)).toEqual({
    bank: "blu by BCA Digital",
    amount: 125001,
    currency: "IDR",
    direction: "CREDIT",
    occurredAt: new Date("2026-11-13T09:06:10Z"),
    recipientLast4: "2222",
    transferType: "BI-FAST",
    trusted: false,
    bankTxId: null,
    status: "UNKNOWN",
    reason: "SCREENSHOT_FORMAT_ONLY_NOT_PAYMENT_EVIDENCE",
  });
});
it.each([
  fixture.text.replace("125.001,00", "125.001,50"),
  fixture.text.replace("125.001,00", "12.50.001,00"),
  fixture.text.replace("125.001,00", "0,00"),
  fixture.text.replace("125.001,00", "9.999.999.999,00"),
  fixture.text + "\nNominal Transfer\nRp 125.001,00",
  fixture.text.replace("13 Nov 2026", "31 Feb 2026"),
  fixture.text.replace("16:06:10", "24:06:10"),
  fixture.text.replace("WIB", "WITA"),
  fixture.text.replace("bluAccount\n0000 1111 2222", "bluAccount\n••••2222"),
  fixture.text.replace("BI-FAST", "REFUND"),
  fixture.text.replace("Ada transaksi masuk", "Ada transaksi keluar"),
  "Forwarded message\n" + fixture.text,
])(
  "rejects ambiguous, changed, partial, unsupported or forwarded text",
  (text) => {
    expect(() => recognizeBluPreview({ ...fixture, text })).toThrow();
  },
);
it("rejects forwarded subjects and bounded input", () => {
  expect(() =>
    recognizeBluPreview({ ...fixture, subject: "Fwd: " + fixture.subject }),
  ).toThrow();
  expect(() =>
    recognizeBluPreview({ ...fixture, text: "x".repeat(32001) }),
  ).toThrow();
});
