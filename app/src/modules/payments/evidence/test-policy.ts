export const BLU_TEST_METHOD = "blu_transfer_test";

/** Test orders can close, but can never become sales or shipments. */
export function testOrderTransitionAllowed(method: string | undefined, to: string) {
  return method !== BLU_TEST_METHOD || ["CANCELLED", "EXPIRED"].includes(to);
}

export function testEvidenceMatches(
  attempt: { payable: number; createdAt: Date; expiresAt: Date },
  evidence: { amount: number | null; occurredAt: Date | null; currency: string; direction: string; accountRef: string; reason: string },
  accountRef: string,
) {
  return evidence.amount === attempt.payable && evidence.currency === "IDR" &&
    evidence.direction === "CREDIT" && evidence.accountRef === accountRef &&
    ["MISSING_STABLE_TRANSACTION_ID", "UNVERIFIED_PROVENANCE", "SELLER_REVIEW_REQUIRED"].includes(evidence.reason) &&
    evidence.occurredAt !== null && +evidence.occurredAt >= +attempt.createdAt &&
    +evidence.occurredAt < +attempt.expiresAt;
}
