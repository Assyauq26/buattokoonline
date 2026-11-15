import { expect, it } from "vitest";
import { BLU_TEST_METHOD, testEvidenceMatches, testOrderTransitionAllowed } from "@/modules/payments/evidence/test-policy";
const start = new Date("2026-11-14T11:00:00Z"), end = new Date(+start + 600000);
const attempt = { payable: 1001, createdAt: start, expiresAt: end };
const evidence = { amount: 1001, occurredAt: new Date(+start + 1000), currency: "IDR", direction: "CREDIT", accountRef: "account-a", reason: "MISSING_STABLE_TRANSACTION_ID" };
it("accepts exact amount and bank time, independent of when email is read", () => {
  expect(testEvidenceMatches(attempt, evidence, "account-a")).toBe(true);
  expect(testEvidenceMatches(attempt, { ...evidence, occurredAt: start }, "account-a")).toBe(true);
});
it("refuses old, late, wrong amount/account/direction and changed evidence", () => {
  for (const patch of [{ occurredAt: new Date(+start - 1) }, { occurredAt: end }, { amount: 1000 }, { amount: 1002 },
    { occurredAt: null }, { currency: "USD" }, { direction: "DEBIT" }, { accountRef: "account-b" },
    { reason: "SOURCE_CHANGED_REQUIRES_REVIEW" }])
    expect(testEvidenceMatches(attempt, { ...evidence, ...patch }, "account-a")).toBe(false);
});
it("never allows a test to become paid, fulfilled or refunded", () => {
  for (const to of ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "COMPLETED", "REFUNDED"])
    expect(testOrderTransitionAllowed(BLU_TEST_METHOD, to)).toBe(false);
  for (const to of ["CANCELLED", "EXPIRED"]) expect(testOrderTransitionAllowed(BLU_TEST_METHOD, to)).toBe(true);
  expect(testOrderTransitionAllowed("bank_transfer", "PAID")).toBe(true);
});
