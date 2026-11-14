import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { evidenceAdminAllowed } from "./access-policy";
import { allocateNewAttempt, lockSource, requirePreview, storeScope } from "./repository";
import { BLU_TEST_METHOD, testEvidenceMatches } from "./test-policy";

export const testOrderInput = z.object({
  sourceId: z.string().min(1).max(100),
  requestId: z.string().uuid(),
  baseAmount: z.number().int().min(10000).max(50000),
  windowMinutes: z.union([z.literal(5), z.literal(10)]),
}).strict();

/** Real-money observation test, no goods/stock/coupon/shipping/settlement. */
export async function createBluTestOrder(actorId: string, raw: unknown) {
  requirePreview();
  if (process.env.PAYMENT_GMAIL_OAUTH_TEST !== "true") throw new HttpError("Uji Gmail belum dikonfigurasi operator", 503);
  const input = testOrderInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: actorId }, include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    } });
    if (!user?.isActive || user.deletedAt || !evidenceAdminAllowed({
      id: actorId, roles: user.roles.map(r => r.role.name),
      permissions: user.roles.flatMap(r => r.role.permissions.map(p => p.permission.key)),
    })) throw new HttpError("Uji pembayaran tidak tersedia untuk akun ini", 403);
    const source = await lockSource(tx, input.sourceId);
    if (source.kind !== "GMAIL_BANK" || !source.encryptedSecret || source.health !== "REVIEW_ONLY")
      throw new HttpError("Hubungkan Gmail dan selesaikan pembacaan notifikasi terlebih dahulu", 409);
    await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "id" = ${source.bankAccountId || ""} FOR SHARE`;
    const bank = await tx.bankAccount.findFirst({ where: { id: source.bankAccountId || "", isActive: true, deletedAt: null } });
    if (!bank || createHash("sha256").update(JSON.stringify(["IDR", bank.accountNumber.replace(/\s/g, "")])).digest("hex") !== source.accountRef)
      throw new HttpError("Rekening sumber berubah. Periksa konfigurasi blu terlebih dahulu", 409);
    const id = `blu_test_${createHash("sha256").update(`${actorId}:${input.requestId}`).digest("hex").slice(0, 40)}`;
    const existing = await tx.paymentEvidenceAttempt.findFirst({ where: { payment: { orderId: id, order: { userId: actorId } } } });
    if (existing) {
      if (existing.sourceId !== source.id || existing.baseAmount !== input.baseAmount ||
        +existing.expiresAt - +existing.createdAt !== input.windowMinutes * 60000)
        throw new HttpError("Permintaan uji sudah digunakan dengan data berbeda", 409);
      return { id: existing.id, replayed: true };
    }
    const now = new Date();
    if (await tx.paymentEvidenceAttempt.count({ where: { sourceId: source.id, expiresAt: { gt: now }, payment: { method: BLU_TEST_METHOD, order: { userId: actorId, status: "PENDING_PAYMENT" } } } }))
      throw new HttpError("Masih ada uji aktif. Gunakan uji tersebut atau tunggu tenggatnya", 409);
    const attempt = await allocateNewAttempt(tx, {
      sourceId: source.id, baseAmount: input.baseAmount, windowMinutes: input.windowMinutes,
    }, async (payable, expiresAt) => {
      const order = await tx.order.create({ data: {
        id, orderNumber: `BLU-TEST-${input.requestId.toUpperCase()}`, userId: actorId,
        subtotal: payable, total: payable, shippingCost: 0, discount: 0, expiresAt,
        note: "UJI TRANSFER BLU — tanpa barang, tanpa pengiriman, tidak boleh dilunasi. Dana hanya diperiksa di rekening sendiri.",
        history: { create: { toStatus: "PENDING_PAYMENT", createdBy: actorId, note: "Uji transfer blu diterbitkan; bukan penjualan barang." } },
      } });
      return tx.payment.create({ data: { orderId: order.id, provider: "manual", method: BLU_TEST_METHOD,
        amount: payable, bankAccountId: bank.id }, include: { order: true } });
    }, now);
    // Use the same issuance instant for both window bounds; DB transaction now()
    // starts earlier than the application clock under lock contention.
    await tx.paymentEvidenceAttempt.update({ where: { id: attempt.id }, data: { createdAt: now } });
    await tx.paymentEvidenceReview.create({ data: { sourceId: source.id, actorId, attemptId: attempt.id,
      action: "BLU_TEST_ISSUED", reason: "Uji transfer nyata khusus admin; tanpa pelunasan, produk, stok atau pengiriman." } });
    return { id: attempt.id, replayed: false };
  });
}

export async function listBluTestOrders(actorId: string) {
  const rows = await prisma.paymentEvidenceAttempt.findMany({
    where: { source: { storeScope: storeScope(), kind: "GMAIL_BANK" }, payment: { method: BLU_TEST_METHOD, order: { userId: actorId } } },
    include: { source: { include: { bankAccount: true } }, payment: { include: { order: true } } },
    orderBy: { createdAt: "desc" }, take: 20,
  });
  return Promise.all(rows.map(async row => {
    const evidence = await prisma.incomingPaymentEvidence.findMany({ where: {
      sourceId: row.sourceId, amount: row.payable, currency: "IDR", direction: "CREDIT", accountRef: row.source.accountRef,
      occurredAt: { gte: row.createdAt, lt: row.expiresAt },
      reason: { in: ["MISSING_STABLE_TRANSACTION_ID", "UNVERIFIED_PROVENANCE", "SELLER_REVIEW_REQUIRED"] },
    }, orderBy: { id: "asc" }, take: 3 });
    const matches = evidence.filter(e => testEvidenceMatches(row, e, row.source.accountRef));
    return { id: row.id, sourceId: row.sourceId, orderNumber: row.payment.order.orderNumber,
      baseAmount: row.baseAmount, uniqueCode: row.uniqueCode, payable: row.payable,
      createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
      closed: row.payment.order.status !== "PENDING_PAYMENT", matches: matches.map(e => e.id),
      // Only the account explicitly selected for this enrolled admin's test.
      bank: row.source.bankAccount ? { name: row.source.bankAccount.bankName,
        number: row.source.bankAccount.accountNumber, holder: row.source.bankAccount.accountHolder } : null,
    };
  }));
}
