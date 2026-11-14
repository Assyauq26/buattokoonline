import "server-only";
import { prisma } from "@/lib/prisma";
import { storeScope } from "./repository";

/** Read-only suggestions, including bank emails without bank transaction IDs.
 * Payer name/reference are intentionally NOT queried. No payment becomes paid. */
export async function evidenceCandidateSuggestions(
  evidenceId: string,
  now = new Date(),
) {
  const e = await prisma.incomingPaymentEvidence.findFirst({
    where: { id: evidenceId, source: { storeScope: storeScope() } },
    include: { source: { select: { accountRef: true } } },
  });
  if (
    !e ||
    !e.amount ||
    !e.occurredAt ||
    e.currency !== "IDR" ||
    e.direction !== "CREDIT" ||
    e.accountRef !== e.source.accountRef
  )
    return [];
  return prisma.paymentEvidenceAttempt.findMany({
    where: {
      sourceId: e.sourceId,
      source: { storeScope: storeScope() },
      payable: e.amount,
      createdAt: { lte: e.occurredAt },
      expiresAt: { gt: e.occurredAt },
      claim: null,
      payment: {
        amount: e.amount,
        status: { in: ["PENDING_PAYMENT", "WAITING_VERIFICATION", "REJECTED"] },
        order: {
          total: e.amount,
          status: "PENDING_PAYMENT",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    },
    select: {
      id: true,
      baseAmount: true,
      uniqueCode: true,
      payable: true,
      payment: { select: { order: { select: { orderNumber: true } } } },
    },
    take: 50,
  });
}
