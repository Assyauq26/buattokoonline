import "server-only";
import type { Prisma, PaymentEvidenceAttempt, PaymentEvidenceSource } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission, lockPaymentOrder } from "@/modules/orders/transaction-locks";
import { settlePaymentInTransaction } from "@/modules/payments/payment-settlement";
import { BLU_CHECKOUT_METHOD } from "./blu-checkout";
import { assertBluOperator } from "./blu-access";
import { lockSource, requirePreview, storeScope } from "./repository";
import { signatureAuditState } from "./signature-audit";

/** A signature binds email bytes; it does not prove bank settlement or payer
 * identity. This routine returns manual-review candidates, never a paid result. */
async function candidates(tx: Prisma.TransactionClient, a: PaymentEvidenceAttempt, s: PaymentEvidenceSource, now: Date) {
  const rows = await tx.incomingPaymentEvidence.findMany({ where: { sourceId: s.id, amount: a.payable,
    accountRef: s.accountRef, currency: "IDR", direction: "CREDIT", providerStatus: "UNKNOWN",
    reason: "MISSING_STABLE_TRANSACTION_ID", occurredAt: { gte: a.createdAt, lt: a.expiresAt, lte: new Date(+now + 300_000) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 21 });
  if (rows.length > 20) throw new HttpError("Terlalu banyak notifikasi; perlukan pemeriksaan terpisah", 409);
  const verified = [];
  for (const e of rows) {
    const audit = await tx.paymentEvidenceReview.findFirst({ where: { sourceId: s.id, evidenceId: e.id,
      action: "BLU_SIGNATURE_CHECK" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { reason: true } });
    if (signatureAuditState(e, audit?.reason).verified) verified.push(e);
  }
  return verified;
}

/** Separate from ingestion: source lease is finished before Order -> Payment ->
 * Source locks. A concurrent retry cannot duplicate review state/notifications. */
export async function reconcileBluSource(sourceId: string, actorId: string, now = new Date(), deadline = Date.now() + 10_000, manual = false) {
  requirePreview();
  await prisma.$transaction(tx => assertBluOperator(tx, actorId));
  const savedCursor = await prisma.paymentEvidenceReview.findFirst({ where: { sourceId,
    source: { storeScope: storeScope() }, action: "BLU_RECONCILE_CHECKPOINT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { reason: true } });
  let cursor: { createdAt: string; id: string } | undefined;
  try {
    const value = JSON.parse(savedCursor?.reason || "null");
    if (value && typeof value.id === "string" && value.id.length <= 100 &&
      typeof value.createdAt === "string" && Number.isFinite(+new Date(value.createdAt))) cursor = value;
  } catch { /* Invalid cursor cannot authorize payment; restart the bounded scan. */ }
  const attempts = await prisma.paymentEvidenceAttempt.findMany({ where: { sourceId,
    source: { storeScope: storeScope(), kind: "GMAIL_BANK", ...(manual ? {} : { enabled: true, automationActorId: actorId }) },
    claim: null, expiresAt: { gt: new Date(+now - 24 * 3600_000) },
    payment: { method: BLU_CHECKOUT_METHOD, status: { in: ["PENDING_PAYMENT", "WAITING_VERIFICATION", "REJECTED", "EXPIRED"] } },
    ...(cursor ? { OR: [{ createdAt: { gt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } }] } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
  let reviewed = 0;
  let last: typeof attempts[number] | undefined;
  for (const a of attempts) {
    if (Date.now() >= deadline) break;
    try { await prisma.$transaction(async tx => {
      await assertBluOperator(tx, actorId);
      await lockPaymentOrder(tx, a.paymentId);
      const s = await lockSource(tx, sourceId);
      if (!manual && (!s.enabled || s.automationActorId !== actorId)) return;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: a.paymentId }, include: { order: true } });
      if (p.method !== BLU_CHECKOUT_METHOD || p.amount !== a.payable || p.order.total !== a.payable || p.status === "PAID") return;
      const found = await candidates(tx, a, s, now);
      if (!found.length) return;
      const late = p.order.status !== "PENDING_PAYMENT" || !p.order.expiresAt || p.order.expiresAt <= now;
      const action = late ? "BLU_LATE_REVIEW" : found.length === 1 ? "BLU_CANDIDATE_REVIEW" : "BLU_AMBIGUOUS_REVIEW";
      if (await tx.paymentEvidenceReview.findFirst({ where: { sourceId, attemptId: a.id, action }, select: { id: true } })) return;
      await tx.paymentEvidenceReview.create({ data: { sourceId, attemptId: a.id, createdAt: now,
        evidenceId: found.length === 1 ? found[0].id : null, action,
        reason: late ? "Notifikasi untuk pembayaran yang ditutup; jangan hidupkan kembali pesanan. Periksa pengembalian secara manual."
          : found.length === 1 ? "Nominal, rekening, waktu dan tanda tangan email cocok. Status bank tidak diketahui; mutasi asli wajib diperiksa seller."
          : "Beberapa notifikasi cocok. Jangan menyatakan lunas sebelum konflik diselesaikan di sumber asli." } });
      if (!late && ["PENDING_PAYMENT", "REJECTED"].includes(p.status)) {
        await tx.payment.update({ where: { id: p.id }, data: { status: "WAITING_VERIFICATION" } });
        await tx.order.update({ where: { id: p.orderId }, data: { paymentStatus: "WAITING_VERIFICATION" } });
      }
      await tx.notification.create({ data: { userId: actorId, type: "payment", title: "Transfer blu perlu pemeriksaan",
        body: `${p.order.orderNumber}: ${late ? "pembayaran ditutup" : found.length > 1 ? "beberapa notifikasi cocok" : "kandidat transfer ditemukan"}. Periksa notifikasi bank; belum dinyatakan lunas.` } });
      if (!late) await tx.notification.create({ data: { userId: p.order.userId, type: "payment",
        title: "Notifikasi transfer ditemukan", body: `Pembayaran ${p.order.orderNumber} sedang diperiksa seller. Jangan transfer ulang.` } });
      reviewed++;
    }); } catch (error) {
      // A poisoned/ambiguous candidate must not starve later orders. Financial
      // approval still fails closed; database/runtime failures stop the scan.
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
    }
    last = a;
  }
  if (last || (!attempts.length && cursor)) await prisma.$transaction(async tx => {
    await assertBluOperator(tx, actorId);
    const s = await lockSource(tx, sourceId);
    if (!manual && (!s.enabled || s.automationActorId !== actorId)) return;
    await tx.paymentEvidenceReview.create({ data: { sourceId, action: "BLU_RECONCILE_CHECKPOINT",
      reason: JSON.stringify(last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null) } });
  });
  return { reviewed, settled: 0 as const };
}

export const bluApprovalInput = z.object({ evidenceId: z.string().min(1).max(100), attemptId: z.string().min(1).max(100),
  bankConfirmed: z.literal(true), reason: z.string().trim().min(15).max(1000) }).strict();

export const bluReviewInput = z.object({ requestId: z.string().uuid(), evidenceId: z.string().min(1).max(100),
  decision: z.enum(["NEEDS_BANK_CHECK", "UNMATCHED", "AMBIGUOUS", "LATE", "REFUND_REQUIRED", "NOT_A_PAYMENT"]),
  reason: z.string().trim().min(15).max(1000) }).strict();
export async function recordBluReview(actorId: string, raw: unknown) {
  requirePreview();
  const input = bluReviewInput.parse(raw);
  return prisma.$transaction(async tx => {
    await assertBluOperator(tx, actorId);
    await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
    const e = await tx.incomingPaymentEvidence.findFirst({ where: { id: input.evidenceId,
      source: { storeScope: storeScope(), kind: "GMAIL_BANK" } }, select: { id: true, sourceId: true } });
    if (!e) throw new HttpError("Notifikasi tidak ditemukan", 404);
    await lockSource(tx, e.sourceId);
    const id = "bmr_" + createHash("sha256").update(JSON.stringify([storeScope(), actorId, input.requestId])).digest("hex");
    const action = "BLU_MANUAL_" + input.decision;
    const existing = await tx.paymentEvidenceReview.findUnique({ where: { id } });
    if (existing) {
      if (existing.sourceId !== e.sourceId || existing.evidenceId !== e.id || existing.action !== action || existing.reason !== input.reason)
        throw new HttpError("Permintaan pemeriksaan sudah dipakai untuk catatan berbeda", 409);
      return { reviewRecorded: true, replay: true };
    }
    await tx.paymentEvidenceReview.create({ data: { id, sourceId: e.sourceId, evidenceId: e.id, actorId, action, reason: input.reason } });
    return { reviewRecorded: true, replay: false };
  });
}

/** Explicit financial staff action after checking the banking app. Unknown bank
 * status never reaches this operation from a scheduler or customer request. */
export async function approveBluManually(actorId: string, raw: unknown, now = new Date()) {
  requirePreview();
  const input = bluApprovalInput.parse(raw);
  return prisma.$transaction(async tx => {
    await assertBluOperator(tx, actorId);
    await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
    const a = await tx.paymentEvidenceAttempt.findFirst({ where: { id: input.attemptId, source: { storeScope: storeScope() } } });
    if (!a) throw new HttpError("Percobaan pembayaran tidak ditemukan", 404);
    await lockPaymentOrder(tx, a.paymentId);
    const s = await lockSource(tx, a.sourceId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: a.paymentId }, include: { order: { include: { items: true } } } });
    const existing = await tx.paymentEvidenceClaim.findUnique({ where: { evidenceId: input.evidenceId } });
    if (existing) {
      if (existing.attemptId === a.id && p.status === "PAID" && p.order.paymentStatus === "PAID") return { ok: true, replay: true };
      throw new HttpError("Notifikasi telah dipakai; jangan klaim untuk pesanan lain", 409);
    }
    if (await tx.paymentEvidenceClaim.findUnique({ where: { attemptId: a.id } })) throw new HttpError("Pesanan sudah memiliki klaim pembayaran", 409);
    if (s.kind !== "GMAIL_BANK" || p.method !== BLU_CHECKOUT_METHOD || p.bankAccountId !== s.bankAccountId ||
      p.amount !== a.payable || p.order.total !== a.payable || p.status !== "WAITING_VERIFICATION" || p.order.status !== "PENDING_PAYMENT")
      throw new HttpError("Pesanan tidak menerima persetujuan blu", 409);
    // Only a timely automatic review can hold an order for later manual approval.
    const timely = await tx.paymentEvidenceReview.findFirst({ where: { attemptId: a.id, sourceId: s.id,
      action: "BLU_CANDIDATE_REVIEW", createdAt: { lt: a.expiresAt } }, select: { id: true } });
    if (!timely || !p.order.expiresAt || p.order.expiresAt.getTime() !== a.expiresAt.getTime())
      throw new HttpError("Notifikasi terlambat atau belum diperiksa; tangani terpisah tanpa menghidupkan pesanan", 409);
    const found = await candidates(tx, a, s, now);
    if (found.length !== 1 || found[0].id !== input.evidenceId) throw new HttpError("Notifikasi berubah atau ambigu; persetujuan ditahan", 409);
    await tx.paymentEvidenceClaim.create({ data: { evidenceId: input.evidenceId, attemptId: a.id, actorId, reason: input.reason } });
    await tx.paymentEvidenceReview.create({ data: { sourceId: s.id, evidenceId: input.evidenceId, attemptId: a.id,
      actorId, action: "BLU_BANK_CONFIRMED_BY_SELLER", reason: input.reason } });
    return settlePaymentInTransaction(tx, p, actorId, "Transfer blu dikonfirmasi seller melalui pemeriksaan mutasi bank");
  });
}
