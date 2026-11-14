/** Integer rupiah only. Evidence can suggest review, never prove order identity. */
export const MAX_IDR = 2_147_483_647;
export function idr(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_IDR
  )
    throw new Error("Nominal IDR harus berupa bilangan bulat positif");
  return value;
}
export function allocateAmount(
  base: number,
  occupied: ReadonlySet<number>,
  maxCode = 999,
) {
  idr(base);
  if (!Number.isInteger(maxCode) || maxCode < 1 || maxCode > 999)
    throw new Error("Rentang kode tidak valid");
  for (let code = 1; code <= maxCode; code++) {
    const payable = base + code;
    if (payable <= MAX_IDR && !occupied.has(payable))
      return { baseAmount: base, uniqueCode: code, payable };
  }
  throw new Error("Kode unik habis. Pilih metode lain atau coba lagi nanti.");
}

export interface Observation {
  externalId: string;
  bankTxId?: string;
  messageId?: string;
  amount: number | null;
  currency: string;
  direction: string;
  status: string;
  accountRef: string;
  occurredAt: Date | null;
  trusted: boolean;
}
export function evidenceReason(o: Observation, account: string): string {
  if (!o.externalId.trim() || !o.bankTxId?.trim())
    return "MISSING_STABLE_TRANSACTION_ID";
  if (!o.trusted) return "UNVERIFIED_PROVENANCE";
  if (o.accountRef !== account) return "ACCOUNT_MISMATCH";
  if (o.currency !== "IDR" || o.direction !== "CREDIT")
    return "NON_IDR_OR_NON_CREDIT";
  if (["REFUND", "PARTIAL_REFUND", "REVERSED"].includes(o.status))
    return "REFUND_OR_REVERSAL";
  if (o.status !== "SETTLEMENT") return "UNKNOWN_OR_UNSETTLED_STATUS";
  if (
    !o.amount ||
    !Number.isSafeInteger(o.amount) ||
    o.amount > MAX_IDR ||
    o.amount < 0
  )
    return "INVALID_AMOUNT";
  if (!o.occurredAt || !Number.isFinite(o.occurredAt.getTime()))
    return "INVALID_TIME";
  return "SELLER_REVIEW_REQUIRED";
}
export function matchReason(
  o: Observation,
  a: { payable: number; createdAt: Date; expiresAt: Date },
  now: Date,
) {
  if (o.occurredAt && o.occurredAt.getTime() > now.getTime() + 300_000)
    return "FUTURE_TIME_REVIEW";
  if (!o.occurredAt || o.occurredAt < a.createdAt)
    return "OUTSIDE_ATTEMPT_WINDOW";
  if (o.occurredAt >= a.expiresAt || now >= a.expiresAt)
    return "LATE_PAYMENT_REVIEW";
  if (o.amount !== a.payable)
    return o.amount && o.amount < a.payable ? "UNDERPAYMENT" : "OVERPAYMENT";
  return "AMOUNT_TIME_ONLY_REQUIRES_SELLER";
}

// Only a draft/preview gate. No environment variable can mark live contracts validated.
export const LIVE_CONNECTORS_VALIDATED = false;
export function previewEnabled() {
  return process.env.PAYMENT_EVIDENCE_PREVIEW === "true";
}
