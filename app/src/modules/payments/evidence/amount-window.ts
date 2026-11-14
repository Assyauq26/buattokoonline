/** Main matching rule selected by the owner: exact unique payable + transaction
 * time inside the issued interval. Identity/authentication and idempotency remain
 * separate operational guards; a match alone never mutates a financial record. */
export type PaymentWindowMinutes = 5 | 10;
export function paymentWindow(start: Date, minutes: PaymentWindowMinutes = 10) {
  if (![5, 10].includes(minutes) || !Number.isFinite(+start))
    throw new Error("Pilih batas waktu 5 atau 10 menit");
  const expiresAt = new Date(+start + minutes * 60_000);
  if (!Number.isFinite(+expiresAt))
    throw new Error("Batas waktu pembayaran tidak valid");
  return { startsAt: new Date(start), expiresAt };
}
export interface AmountWindowCandidate {
  id: string;
  payable: number;
  createdAt: Date;
  expiresAt: Date;
}
export function matchAmountWindow(
  input: { amount: number | null; occurredAt: Date | null },
  candidates: readonly AmountWindowCandidate[],
) {
  if (
    !input.amount ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > 2_147_483_647 ||
    !input.occurredAt ||
    !Number.isFinite(+input.occurredAt)
  )
    return { status: "INVALID_INPUT" as const, candidateIds: [] as string[] };
  const candidateIds = [
    ...new Set(
      candidates
        .filter(
          (c) =>
            c.payable === input.amount &&
            Number.isFinite(+c.createdAt) &&
            Number.isFinite(+c.expiresAt) &&
            +c.createdAt <= +input.occurredAt! &&
            +input.occurredAt! < +c.expiresAt,
        )
        .map((c) => c.id),
    ),
  ];
  return {
    status:
      candidateIds.length === 1
        ? ("MATCHED" as const)
        : candidateIds.length > 1
          ? ("AMBIGUOUS" as const)
          : ("NO_MATCH" as const),
    candidateIds,
  };
}
