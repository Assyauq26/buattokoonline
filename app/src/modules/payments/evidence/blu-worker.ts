import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { bluCheckoutEnabled } from "./blu-checkout";
import { reviewGmailNow } from "./gmail-review";
import { lockSource, storeScope } from "./repository";
import { reconcileBluSource } from "./blu-reconciliation";

/** Invoked by the existing local maintenance timer, independent of buyer tabs.
 * Persisted nextPollAt, cursor, failures and generation lease survive restart.
 * No bank mutation or automatic PAID exists in this worker. */
export async function runBluWorker() {
  if (!bluCheckoutEnabled()) return { read: 0, reviewed: 0, failed: 0, enabled: false };
  const now = new Date(), end = Date.now() + 55_000, signal = AbortSignal.timeout(45_000);
  const sources = await prisma.paymentEvidenceSource.findMany({ where: {
    storeScope: storeScope(), kind: "GMAIL_BANK", enabled: true, encryptedSecret: { not: null },
    automationActorId: { not: null }, health: { not: "RECONNECT_REQUIRED" },
    AND: [{ OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] },
      { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }],
  }, orderBy: [{ nextPollAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 10 });
  let read = 0, reviewed = 0, failed = 0;
  for (const s of sources) {
    if (signal.aborted || Date.now() > end - 10_000) break;
    try {
      const result = await reviewGmailNow(s.automationActorId!, s.id, true, signal);
      read += result.count;
    } catch (error) {
      failed++;
      if (error instanceof HttpError && error.status === 403) {
        await prisma.$transaction(async tx => {
          const current = await lockSource(tx, s.id);
          if (current.generation !== s.generation || current.automationActorId !== s.automationActorId) return;
          await tx.paymentEvidenceSource.update({ where: { id: s.id }, data: { enabled: false, automationActorId: null,
            generation: { increment: 1 }, leaseToken: null, leaseUntil: null } });
          await tx.paymentEvidenceReview.create({ data: { sourceId: s.id, action: "BLU_OPERATOR_ACCESS_REVOKED",
            reason: "Akses pengelola berubah. Pembacaan otomatis dan checkout dihentikan; histori serta token tetap privat." } });
        });
      }
      // Provider bodies, email, account numbers, credentials and arbitrary error
      // text never enter the maintenance response or log.
    }
    if (Date.now() < end) {
      try { reviewed += (await reconcileBluSource(s.id, s.automationActorId!, new Date(), end)).reviewed; }
      catch { /* A revoked generation or operator cannot update review state. */ }
    }
  }
  return { read, reviewed, failed, enabled: true };
}
