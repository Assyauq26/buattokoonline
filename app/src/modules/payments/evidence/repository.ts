import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import {
  assertStaffPermission,
  lockPaymentOrder,
} from "@/modules/orders/transaction-locks";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { paymentWindow, type PaymentWindowMinutes } from "./amount-window";
import { BLU_TEST_METHOD } from "./test-policy";
import {
  allocateAmount,
  evidenceReason,
  matchReason,
  previewEnabled,
  type Observation,
} from "./policy";

export function storeScope() {
  const value = process.env.STORE_INSTALLATION_ID;
  if (!value || !/^[A-Za-z0-9_-]{8,100}$/.test(value))
    throw new HttpError("Identitas instalasi toko belum tersedia", 503);
  return value;
}
export function requirePreview() {
  if (!previewEnabled())
    throw new HttpError("Pratinjau metode pembayaran belum diaktifkan", 404);
}
export async function lockSource(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "PaymentEvidenceSource" WHERE "id" = ${id} AND "storeScope" = ${storeScope()} FOR UPDATE`,
  );
  if (!rows.length)
    throw new HttpError("Sumber pembayaran tidak ditemukan", 404);
  return tx.paymentEvidenceSource.findUniqueOrThrow({ where: { id } });
}

/** Internal allocation seam; caller must create a new payable Payment in the SAME tx.
 * Never rewrite existing totals to retrofit this method onto an old order. */
export async function allocateAttempt(
  tx: Prisma.TransactionClient,
  input: {
    sourceId: string;
    paymentId: string;
    baseAmount: number;
    expiresAt: Date;
    maxCode?: number;
  },
  now = new Date(),
) {
  await lockPaymentOrder(tx, input.paymentId);
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: input.paymentId },
    include: { order: true },
  });
  await lockSource(tx, input.sourceId);
  const existing = await tx.paymentEvidenceAttempt.findUnique({
    where: { paymentId: payment.id },
  });
  if (existing) {
    if (
      existing.sourceId !== input.sourceId ||
      existing.baseAmount !== input.baseAmount
    )
      throw new HttpError("Percobaan pembayaran berbeda", 409);
    return existing;
  }
  if (
    payment.order.status !== "PENDING_PAYMENT" ||
    payment.status !== "PENDING_PAYMENT" ||
    !Number.isFinite(+input.expiresAt) ||
    input.expiresAt <= now ||
    input.expiresAt.getTime() - now.getTime() > 10 * 60_000
  )
    throw new HttpError("Percobaan pembayaran tidak valid", 409);
  const occupied = await tx.paymentEvidenceAttempt.findMany({
    where: { sourceId: input.sourceId, retainUntil: { gt: now } },
    select: { payable: true },
  });
  const amount = allocateAmount(
    input.baseAmount,
    new Set(occupied.map((a) => a.payable)),
    input.maxCode,
  );
  if (
    payment.amount !== amount.payable ||
    payment.order.total !== amount.payable
  )
    throw new HttpError(
      "Total pembayaran belum mencakup kode unik secara konsisten",
      409,
    );
  return tx.paymentEvidenceAttempt.create({
    data: {
      sourceId: input.sourceId,
      paymentId: payment.id,
      ...amount,
      expiresAt: input.expiresAt,
      retainUntil: new Date(input.expiresAt.getTime() + 7 * 86400_000),
    },
  });
}

/** New-checkout seam: lock the source and choose the amount BEFORE creating a NEW
 * order/payment. Callback must only create new records in this same transaction;
 * it must not lock/update an existing order. Existing lifecycle writers use the
 * order-first path above, so no source→existing-order lock inversion is introduced. */
export async function allocateNewAttempt(
  tx: Prisma.TransactionClient,
  input: {
    sourceId: string;
    baseAmount: number;
    expiresAt?: Date;
    windowMinutes?: PaymentWindowMinutes;
    maxCode?: number;
  },
  createNewPayment: (
    payable: number,
    expiresAt: Date,
  ) => Promise<{
    id: string;
    amount: number;
    order: { total: number; status: string; expiresAt: Date | null };
  }>,
  now = new Date(),
) {
  const issued = paymentWindow(now, input.windowMinutes);
  const expiresAt = input.expiresAt ?? issued.expiresAt;
  await lockSource(tx, input.sourceId);
  if (
    !Number.isFinite(+expiresAt) ||
    expiresAt <= now ||
    +expiresAt - +now > 10 * 60_000 ||
    (input.windowMinutes !== undefined && +expiresAt !== +issued.expiresAt)
  )
    throw new HttpError("Tenggat pembayaran tidak valid", 422);
  const occupied = await tx.paymentEvidenceAttempt.findMany({
    where: { sourceId: input.sourceId, retainUntil: { gt: now } },
    select: { payable: true },
  });
  const amount = allocateAmount(
    input.baseAmount,
    new Set(occupied.map((a) => a.payable)),
    input.maxCode,
  );
  const payment = await createNewPayment(amount.payable, new Date(expiresAt));
  if (
    payment.amount !== amount.payable ||
    payment.order.total !== amount.payable ||
    payment.order.status !== "PENDING_PAYMENT" ||
    !payment.order.expiresAt ||
    +payment.order.expiresAt !== +expiresAt
  )
    throw new HttpError(
      "Total pembayaran belum mencakup kode unik secara konsisten",
      409,
    );
  return tx.paymentEvidenceAttempt.create({
    data: {
      sourceId: input.sourceId,
      paymentId: payment.id,
      ...amount,
      expiresAt,
      retainUntil: new Date(expiresAt.getTime() + 7 * 86400_000),
    },
  });
}

export function observationFingerprint(o: Observation) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        o.bankTxId,
        o.amount,
        o.currency,
        o.direction,
        o.status,
        o.accountRef,
        o.occurredAt?.toISOString(),
        o.trusted,
      ]),
    )
    .digest("hex");
}
function checkedObservation(o: Observation) {
  for (const s of [
    o.externalId,
    o.bankTxId,
    o.messageId,
    o.accountRef,
    o.currency,
    o.status,
    o.direction,
  ])
    if (s !== undefined && (typeof s !== "string" || s.length > 256))
      throw new HttpError("Bukti pembayaran tidak valid", 422);
  if (
    !o.externalId.trim() ||
    (o.amount !== null &&
      (!Number.isInteger(o.amount) ||
        o.amount < 0 ||
        o.amount > 2_147_483_647)) ||
    (o.occurredAt && !Number.isFinite(o.occurredAt.getTime()))
  )
    throw new HttpError("Bukti pembayaran tidak valid", 422);
}

/** Worker-only: source lease/generation fences writes from disconnected/stale workers. */
export async function ingestObservation(
  sourceId: string,
  generation: number,
  leaseToken: string,
  o: Observation,
  now = new Date(),
) {
  checkedObservation(o);
  return prisma.$transaction(async (tx) => {
    const source = await lockSource(tx, sourceId);
    if (
      source.generation !== generation ||
      source.leaseToken !== leaseToken ||
      !source.leaseUntil ||
      source.leaseUntil <= now
    )
      throw new HttpError("Lease sumber pembayaran sudah berakhir", 409);
    const duplicates = await tx.incomingPaymentEvidence.findMany({
      where: {
        sourceId,
        OR: [
          { externalId: o.externalId },
          ...(o.bankTxId ? [{ bankTxId: o.bankTxId }] : []),
          ...(o.messageId ? [{ messageId: o.messageId }] : []),
        ],
      },
    });
    const fp = observationFingerprint(o);
    if (duplicates.length) {
      const old = duplicates[0];
      if (duplicates.length > 1 || old.fingerprint !== fp) {
        // Never erase previously observed money or quietly turn a refund into paid.
        await tx.incomingPaymentEvidence.updateMany({
          where: { id: { in: duplicates.map((d) => d.id) } },
          data: { reason: "SOURCE_CHANGED_REQUIRES_REVIEW", trusted: false },
        });
        await tx.paymentEvidenceReview.create({
          data: {
            sourceId,
            action: "SOURCE_CHANGED",
            evidenceId: old.id,
            reason:
              "Status/identitas sumber berubah; periksa mutasi dan refund secara terpisah.",
          },
        });
      }
      return old.id;
    }
    const evidence = await tx.incomingPaymentEvidence.create({
      data: {
        sourceId,
        externalId: o.externalId,
        bankTxId: o.bankTxId,
        messageId: o.messageId,
        fingerprint: fp,
        amount: o.amount,
        currency: o.currency,
        direction: o.direction,
        providerStatus: o.status,
        accountRef: o.accountRef,
        occurredAt: o.occurredAt,
        trusted: o.trusted,
        reason: evidenceReason(o, source.accountRef),
      },
    });
    await tx.paymentEvidenceReview.create({
      data: {
        sourceId,
        evidenceId: evidence.id,
        action: "OBSERVED",
        reason: evidence.reason,
      },
    });
    return evidence.id;
  });
}

export async function acquireSourceLease(
  sourceId: string,
  now = new Date(),
  expectedGeneration?: number,
) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSource(tx, sourceId);
    if (
      (expectedGeneration !== undefined &&
        s.generation !== expectedGeneration) ||
      (s.leaseUntil && s.leaseUntil > now) ||
      (s.nextPollAt && s.nextPollAt > now)
    )
      return null;
    const token = randomUUID();
    await tx.paymentEvidenceSource.update({
      where: { id: sourceId },
      data: {
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + 120_000),
      },
    });
    return { token, generation: s.generation, cursor: s.cursor };
  });
}
export async function finishSourceLease(
  sourceId: string,
  token: string,
  generation: number,
  result: { ok: boolean; cursor?: string; authFailed?: boolean },
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSource(tx, sourceId);
    if (
      s.leaseToken !== token ||
      s.generation !== generation ||
      !s.leaseUntil ||
      s.leaseUntil <= now
    )
      throw new HttpError("Lease sumber pembayaran sudah berakhir", 409);
    const failures = result.ok ? 0 : Math.min(s.failures + 1, 16);
    await tx.paymentEvidenceSource.update({
      where: { id: sourceId },
      data: {
        leaseToken: null,
        leaseUntil: null,
        failures,
        lastCheckedAt: now,
        health: result.authFailed
          ? "RECONNECT_REQUIRED"
          : result.ok
            ? "REVIEW_ONLY"
            : "TEMPORARILY_UNAVAILABLE",
        nextPollAt: new Date(
          now.getTime() +
            (result.ok ? 60_000 : Math.min(3600_000, 30_000 * 2 ** failures)),
        ),
        // Failure must not advance a cursor over unprocessed evidence.
        ...(result.ok && result.cursor !== undefined
          ? { cursor: result.cursor }
          : {}),
      },
    });
  });
}

/** Permanent association only, NOT settlement. Existing proof approval remains separate. */
export async function claimEvidence(
  actorId: string,
  evidenceId: string,
  attemptId: string,
  reason: string,
  now = new Date(),
) {
  requirePreview();
  if (
    typeof reason !== "string" ||
    reason.trim().length < 15 ||
    reason.length > 1000
  )
    throw new HttpError(
      "Tuliskan hasil pemeriksaan sumber pembayaran (15–1000 karakter)",
      422,
    );
  return prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
    const a = await tx.paymentEvidenceAttempt.findFirst({
      where: { id: attemptId, source: { storeScope: storeScope() } },
    });
    if (!a) throw new HttpError("Percobaan pembayaran tidak ditemukan", 404);
    await lockPaymentOrder(tx, a.paymentId);
    const source = await lockSource(tx, a.sourceId);
    const e = await tx.incomingPaymentEvidence.findFirst({
      where: { id: evidenceId, sourceId: source.id },
    });
    if (!e) throw new HttpError("Bukti pembayaran tidak ditemukan", 404);
    const existing = await tx.paymentEvidenceClaim.findUnique({
      where: { evidenceId },
    });
    if (existing) {
      if (existing.attemptId !== attemptId)
        throw new HttpError("Transaksi sudah diklaim pesanan lain", 409);
      return existing;
    }
    if (await tx.paymentEvidenceClaim.findUnique({ where: { attemptId } }))
      throw new HttpError("Pesanan sudah memiliki klaim transaksi lain", 409);
    const p = await tx.payment.findUniqueOrThrow({
      where: { id: a.paymentId },
      include: { order: true },
    });
    const observation: Observation = {
      externalId: e.externalId,
      bankTxId: e.bankTxId || undefined,
      amount: e.amount,
      currency: e.currency,
      direction: e.direction,
      status: e.providerStatus,
      accountRef: e.accountRef,
      occurredAt: e.occurredAt,
      trusted: e.trusted,
    };
    if (p.method === BLU_TEST_METHOD) throw new HttpError("Uji blu tidak dapat diklaim sebagai pembayaran pesanan", 409);
    if (
      e.reason !== "SELLER_REVIEW_REQUIRED" ||
      evidenceReason(observation, source.accountRef) !==
        "SELLER_REVIEW_REQUIRED" ||
      matchReason(observation, a, now) !== "AMOUNT_TIME_ONLY_REQUIRES_SELLER" ||
      p.order.status !== "PENDING_PAYMENT" ||
      !["PENDING_PAYMENT", "WAITING_VERIFICATION", "REJECTED"].includes(
        p.status,
      ) ||
      (p.order.expiresAt && p.order.expiresAt <= now) ||
      p.amount !== a.payable ||
      p.order.total !== a.payable
    )
      throw new HttpError(
        "Transaksi memerlukan penanganan terpisah; klaim tidak diizinkan",
        409,
      );
    const claim = await tx.paymentEvidenceClaim.create({
      data: { evidenceId, attemptId, actorId, reason: reason.trim() },
    });
    await tx.paymentEvidenceReview.create({
      data: {
        sourceId: source.id,
        evidenceId,
        attemptId,
        actorId,
        action: "MANUAL_ASSOCIATION_NOT_PAID",
        reason: reason.trim(),
      },
    });
    return claim;
  });
}
