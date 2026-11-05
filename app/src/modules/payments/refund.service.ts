import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { lockOrder, lockPaymentOrder, assertStaffPermission } from "@/modules/orders/transaction-locks";
import { writeAudit } from "@/modules/audit/audit.service";
import { activeRefund, refundResolutionKey, REFUNDABLE_ORDER_STATUSES } from "./refund-state";
import { refundRequestSchema, refundVerificationSchema, refundReturnSchema } from "./refund.validation";
import { assertNoUnresolvedJntDispatch } from "@/modules/shipping/jnt-dispatch-state";

function object(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("Ledger refund tidak valid; perlu rekonsiliasi", 409);
  return value;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function refundTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return await prisma.$transaction(fn, { timeout: 15000 }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError("Referensi atau request refund sudah digunakan", 409);
    throw error;
  }
}
async function lockedRequest(tx: Prisma.TransactionClient, requestId: string) {
  const initial = await tx.paymentEvent.findUnique({ where: { id: requestId } });
  if (!initial || initial.type !== "REFUND_REQUESTED") throw new HttpError("Request refund tidak ditemukan", 404);
  await lockPaymentOrder(tx, initial.paymentId);
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: initial.paymentId }, include: { order: { include: { items: { orderBy: { variantId: "asc" } } } } } });
  return { request: initial, payment, payload: object(initial.payload) };
}

/** Full refund intent only. No transfer is initiated and no stock is returned. */
export async function requestRefund(orderId: string, actorId: string, value: unknown) {
  const input = refundRequestSchema.parse(value);
  return refundTransaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
    await lockOrder(tx, orderId);
    const payment = await tx.payment.findUnique({ where: { orderId }, include: { order: true } });
    if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
    const key = `refund-request:${input.requestId}`;
    const previous = await tx.paymentEvent.findUnique({ where: { paymentId_externalId: { paymentId: payment.id, externalId: key } } });
    if (previous) {
      if (object(previous.payload).fingerprint !== digest(input)) throw new HttpError("Request ID refund digunakan untuk payload berbeda", 409);
      return previous;
    }
    await assertNoUnresolvedJntDispatch(tx, orderId);
    if (payment.provider !== "manual") throw new HttpError("Provider memerlukan refund/reconciliation khusus; manual workflow tidak diizinkan", 409);
    if (payment.status !== "PAID" || payment.order.paymentStatus !== "PAID" || !(REFUNDABLE_ORDER_STATUSES as readonly string[]).includes(payment.order.status)) throw new HttpError("Refund hanya untuk order dengan pembayaran terverifikasi", 409);
    if (input.amount !== payment.amount || input.amount !== payment.order.total) throw new HttpError("Hanya refund penuh sesuai payment/order yang didukung", 422);
    if (await activeRefund(tx, payment.id)) throw new HttpError("Sudah ada request refund aktif", 409);
    const event = await tx.paymentEvent.create({ data: { paymentId: payment.id, type: "REFUND_REQUESTED", externalId: key, payload: { ...input, actorId, fingerprint: digest(input), orderStatus: payment.order.status } } });
    await writeAudit({ userId: actorId, action: "refund.request", entity: "Payment", entityId: payment.id, meta: { requestId: event.id, amount: input.amount } }, tx);
    return event;
  });
}

/** Record an independently reviewed, already settled manual bank refund, not a provider API success. */
export async function confirmManualRefund(requestId: string, actorId: string, value: unknown) {
  const input = refundVerificationSchema.parse(value);
  return refundTransaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
    const { payment, payload } = await lockedRequest(tx, requestId);
    if (payload.actorId === actorId) throw new HttpError("Verifier refund harus staf finansial berbeda dari pembuat request", 403);
    const key = refundResolutionKey(requestId);
    const resolution = await tx.paymentEvent.findUnique({ where: { paymentId_externalId: { paymentId: payment.id, externalId: key } } });
    if (resolution) {
      if (resolution.type !== "REFUND_CONFIRMED" || object(resolution.payload).fingerprint !== digest(input)) throw new HttpError("Refund sudah diselesaikan dengan keputusan/payload berbeda", 409);
      return resolution;
    }
    await assertNoUnresolvedJntDispatch(tx, payment.orderId);
    if (payment.provider !== "manual" || payment.status !== "PAID" || payment.order.paymentStatus !== "PAID" || !(REFUNDABLE_ORDER_STATUSES as readonly string[]).includes(payment.order.status)) throw new HttpError("Order/payment tidak menerima refund", 409);
    if (input.amount !== payment.amount || input.amount !== payload.amount || input.settledAt < payment.createdAt) throw new HttpError("Nominal atau waktu settlement tidak sesuai payment", 422);
    if (!await tx.bankAccount.findUnique({ where: { id: input.sourceAccountId } })) throw new HttpError("Rekening settlement tidak ditemukan", 422);
    const settlementId = `refund_money_${digest([input.sourceAccountId, input.evidenceReference]).slice(0, 40)}`;
    if (await tx.paymentEvent.findUnique({ where: { id: settlementId } })) throw new HttpError("Referensi transfer refund sudah digunakan", 409);
    const event = await tx.paymentEvent.create({ data: { id: settlementId, paymentId: payment.id, type: "REFUND_CONFIRMED", externalId: key, payload: { ...input, settledAt: input.settledAt.toISOString(), actorId, requestId, fingerprint: digest(input), moneyStatus: "VERIFIED_MANUAL_SETTLEMENT" } } });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    await tx.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } });
    await tx.orderStatusHistory.create({ data: { orderId: payment.orderId, fromStatus: payment.order.status, toStatus: "REFUNDED", createdBy: actorId, note: `Refund penuh terverifikasi manual: ${input.evidenceReference}` } });
    await writeAudit({ userId: actorId, action: "refund.confirm_manual", entity: "Payment", entityId: payment.id, meta: { requestId, amount: input.amount, settlementId } }, tx);
    return event;
  });
}

export async function declineRefund(requestId: string, actorId: string, reason: string) {
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 2000) throw new HttpError("Alasan penolakan refund diperlukan", 422);
  return refundTransaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.PAYMENT_VERIFY);
    const { payment } = await lockedRequest(tx, requestId);
    const key = refundResolutionKey(requestId);
    const existing = await tx.paymentEvent.findUnique({ where: { paymentId_externalId: { paymentId: payment.id, externalId: key } } });
    if (existing) {
      if (existing.type !== "REFUND_DECLINED" || object(existing.payload).reason !== reason.trim()) throw new HttpError("Refund sudah diselesaikan", 409);
      return existing;
    }
    const event = await tx.paymentEvent.create({ data: { paymentId: payment.id, type: "REFUND_DECLINED", externalId: key, payload: { requestId, actorId, reason: reason.trim() } } });
    await writeAudit({ userId: actorId, action: "refund.decline", entity: "Payment", entityId: payment.id, meta: { requestId } }, tx);
    return event;
  });
}

/** Explicit warehouse receipt. Refund confirmation itself never increases onHand. */
export async function receiveRefundReturn(requestId: string, actorId: string, value: unknown) {
  const input = refundReturnSchema.parse(value);
  const normalized = { ...input, receivedAt: input.receivedAt.toISOString(), items: [...input.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)) };
  return refundTransaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.INVENTORY_READ);
    await assertStaffPermission(tx, actorId, PERMISSIONS.INVENTORY_ADJUST);
    const { payment } = await lockedRequest(tx, requestId);
    const confirmed = await tx.paymentEvent.findUnique({ where: { paymentId_externalId: { paymentId: payment.id, externalId: refundResolutionKey(requestId) } } });
    if (confirmed?.type !== "REFUND_CONFIRMED" || payment.status !== "REFUNDED" || payment.order.paymentStatus !== "REFUNDED" || payment.order.status !== "REFUNDED") throw new HttpError("Retur hanya untuk refund yang telah terverifikasi", 409);
    const key = `refund-return:${input.requestId}`;
    const prior = await tx.paymentEvent.findUnique({ where: { paymentId_externalId: { paymentId: payment.id, externalId: key } } });
    if (prior) {
      if (object(prior.payload).fingerprint !== digest(normalized)) throw new HttpError("Request ID retur digunakan untuk payload berbeda", 409);
      return prior;
    }
    const receipts = await tx.paymentEvent.findMany({ where: { paymentId: payment.id, type: "REFUND_RETURN_RECEIVED" } });
    const previousItems = receipts.flatMap(r => refundReturnSchema.parse(object(r.payload)).items);
    if (input.receivedAt < payment.order.createdAt) throw new HttpError("Waktu penerimaan retur mendahului order", 422);
    const selected = input.items.map(item => {
      const original = payment.order.items.find(i => i.id === item.orderItemId);
      if (!original || item.quantity + previousItems.filter(i => i.orderItemId === item.orderItemId).reduce((sum, i) => sum + i.quantity, 0) > original.quantity) throw new HttpError("Retur melebihi item terjual atau bukan milik order", 409);
      return { ...item, variantId: original.variantId };
    }).sort((a, b) => a.variantId.localeCompare(b.variantId));
    const receipt = await tx.paymentEvent.create({ data: { paymentId: payment.id, type: "REFUND_RETURN_RECEIVED", externalId: key, payload: { ...normalized, actorId, refundRequestId: requestId, fingerprint: digest(normalized) } } });
    for (const item of selected) {
      const count = await tx.$executeRaw(Prisma.sql`UPDATE "Inventory" SET "onHand" = "onHand" + ${item.quantity}, "updatedAt" = NOW() WHERE "variantId" = ${item.variantId} AND "reserved" >= 0 AND "onHand" >= "reserved" AND "onHand" <= ${2_147_483_647 - item.quantity}`);
      if (count !== 1) throw new HttpError("Stok retur tidak konsisten", 409);
      await tx.inventoryMovement.create({ data: { variantId: item.variantId, type: "RETURN", quantity: item.quantity, reference: receipt.id, note: input.reason } });
    }
    await writeAudit({ userId: actorId, action: "refund.return_received", entity: "Payment", entityId: payment.id, meta: { requestId, receiptId: receipt.id } }, tx);
    return receipt;
  });
}

export async function listRefundLedger(orderId: string, actorId: string) {
  await assertStaffPermission(prisma, actorId, PERMISSIONS.PAYMENT_READ);
  const payment = await prisma.payment.findUnique({ where: { orderId }, select: { id: true, status: true, events: { where: { type: { in: ["REFUND_REQUESTED", "REFUND_CONFIRMED", "REFUND_DECLINED", "REFUND_RETURN_RECEIVED"] } }, orderBy: { createdAt: "asc" } } } });
  if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
  return payment;
}

/** Warehouse projection: no bank reference, settlement evidence or financial ledger payload. */
export async function refundReturnEligibility(orderId: string, actorId: string) {
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.INVENTORY_READ);
    await assertStaffPermission(tx, actorId, PERMISSIONS.INVENTORY_ADJUST);
    await lockOrder(tx, orderId);
    const payment = await tx.payment.findUnique({ where: { orderId }, include: { order: { include: { items: true } }, events: { where: { type: { in: ["REFUND_CONFIRMED", "REFUND_RETURN_RECEIVED"] } } } } });
    const confirmed = payment?.events.find(e => e.type === "REFUND_CONFIRMED");
    if (!payment || payment.status !== "REFUNDED" || payment.order.status !== "REFUNDED" || payment.order.paymentStatus !== "REFUNDED" || !confirmed) return { eligible: false as const, requestId: null, items: [] };
    const requestId = object(confirmed.payload).requestId;
    if (typeof requestId !== "string") throw new HttpError("Ledger refund memerlukan rekonsiliasi", 409);
    const returned = payment.events.filter(e => e.type === "REFUND_RETURN_RECEIVED").flatMap(e => refundReturnSchema.parse(object(e.payload)).items);
    return { eligible: true as const, requestId, items: payment.order.items.map(item => ({ orderItemId: item.id, variantId: item.variantId, productName: item.productName, variantLabel: item.variantLabel, soldQuantity: item.quantity, returnableQuantity: item.quantity - returned.filter(i => i.orderItemId === item.id).reduce((sum, i) => sum + i.quantity, 0) })) };
  });
}
