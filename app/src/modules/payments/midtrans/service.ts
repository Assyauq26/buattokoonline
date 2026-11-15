import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type MidtransAttempt, type MidtransConfiguration } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { lockPaymentOrder, assertStaffPermission } from "@/modules/orders/transaction-locks";
import { settlePaymentInTransaction } from "../payment-settlement";
import { seal, unseal } from "../evidence/secrets";
import { MIDTRANS_METHOD, MIDTRANS_TERMINAL, rupiah } from "./policy";
import { publicOrigin, scope } from "./settings";
import { MidtransRequestError, snapRequest, statusRequest, type ProviderStatus } from "./client";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type BoundAttempt = MidtransAttempt & { configuration: MidtransConfiguration };
function serverKey(config: MidtransConfiguration) { return unseal(config.serverKeyEnvelope, scope(), config.id, "midtrans-server-key"); }
function safeStatus(data: ProviderStatus) {
  const result: Record<string, string> = {};
  for (const key of ["order_id", "transaction_id", "merchant_id", "gross_amount", "currency", "transaction_status", "fraud_status", "payment_type", "status_code"] as const)
    if (typeof data[key] === "string" && data[key]!.length <= 150) result[key] = data[key]!;
  return result;
}
export async function authorizeOrder(orderId: string, userId: string, staff = false) {
  if (staff) await prisma.$transaction(tx => assertStaffPermission(tx, userId, PERMISSIONS.PAYMENT_READ));
  const payment = await prisma.payment.findFirst({ where: { orderId, method: MIDTRANS_METHOD, order: { ...(staff ? {} : { userId }), user: { isActive: true } } }, select: { id: true } });
  if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
  return payment.id;
}
export async function paymentView(orderId: string) {
  const payment = await prisma.payment.findUnique({ where: { orderId }, include: { order: { select: { status: true } },
    midtransAttempts: { where: { configuration: { storeScope: scope() } }, orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, providerOrderId: true, state: true, providerStatus: true, channel: true, transactionId: true, amount: true,
        expiresAt: true, lastCheckedAt: true, lastError: true, createdAt: true } } } });
  if (!payment || payment.method !== MIDTRANS_METHOD) throw new HttpError("Pembayaran tidak ditemukan", 404);
  return { amount: payment.amount, status: payment.status, orderStatus: payment.order.status,
    attempts: payment.midtransAttempts, serverNow: new Date().toISOString() };
}

/** Claim before networking; a timed-out create is never blindly repeated. */
export async function openSnap(paymentId: string) {
  const lease = randomUUID();
  const result = await prisma.$transaction(async tx => {
    await lockPaymentOrder(tx, paymentId);
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    if (payment.method !== MIDTRANS_METHOD || payment.status === "PAID" || payment.order.status !== "PENDING_PAYMENT") throw new HttpError("Pesanan tidak menerima pembayaran", 409);
    const attempt = await tx.midtransAttempt.findFirst({ where: { paymentId, configuration: { storeScope: scope() } }, orderBy: { createdAt: "desc" }, include: { configuration: true } });
    if (!attempt || attempt.expiresAt.getTime() <= Date.now()) throw new HttpError("Batas pembayaran telah lewat. Jangan membayar; tunggu pemeriksaan status.", 409);
    if (attempt.snapEnvelope && attempt.state === "PENDING") return { attempt, ready: true };
    if (attempt.expiresAt.getTime() - Date.now() < 5 * 60_000) throw new HttpError("Waktu tidak cukup untuk percobaan baru. Tunggu penutupan pesanan.", 409);
    if (attempt.state === "TERMINAL" && MIDTRANS_TERMINAL.includes(attempt.providerStatus || "") && attempt.closedAt) {
      const fresh = await tx.midtransAttempt.create({ data: { id: randomUUID(), paymentId, configId: attempt.configId,
        providerOrderId: "BTS-" + randomUUID().replaceAll("-", ""), amount: attempt.amount, expiresAt: attempt.expiresAt,
        state: "CREATING", creationStartedAt: new Date(), leaseToken: lease, leaseUntil: new Date(Date.now() + 45_000) }, include: { configuration: true } });
      return { attempt: fresh, ready: false };
    }
    if (attempt.state !== "NEW") throw new HttpError("Percobaan sedang diperiksa atau telah selesai. Klik Cek pembayaran; token tidak dibuat ulang.", 409);
    await tx.midtransAttempt.update({ where: { id: attempt.id }, data: { state: "CREATING", creationStartedAt: new Date(), leaseToken: lease, leaseUntil: new Date(Date.now() + 45_000) } });
    return { attempt, ready: false };
  });
  const attempt = result.attempt;
  if (result.ready) return { ...JSON.parse(unseal(attempt.snapEnvelope!, scope(), attempt.id, "midtrans-snap")), clientKey: attempt.configuration.clientKey, environment: attempt.configuration.environment };
  try {
    const snap = await snapRequest(attempt.configuration.environment, serverKey(attempt.configuration), {
      orderId: attempt.providerOrderId, amount: attempt.amount, start: new Date(), expiresAt: attempt.expiresAt,
      finish: `${publicOrigin()}/payments/midtrans/finish?order_id=${encodeURIComponent(attempt.providerOrderId)}`,
    });
    const persisted = await prisma.midtransAttempt.updateMany({ where: { id: attempt.id, leaseToken: lease, state: "CREATING" },
      data: { state: "PENDING", snapEnvelope: seal(JSON.stringify(snap), scope(), attempt.id, "midtrans-snap"), leaseToken: null, leaseUntil: null, lastError: null } });
    if (!persisted.count) throw new HttpError("Status berubah; periksa pembayaran sebelum melanjutkan", 409);
    return { ...snap, clientKey: attempt.configuration.clientKey, environment: attempt.configuration.environment };
  } catch (error) {
    const uncertain = !(error instanceof MidtransRequestError) || error.uncertain;
    await prisma.midtransAttempt.updateMany({ where: { id: attempt.id, leaseToken: lease }, data: { state: uncertain ? "CREATION_UNKNOWN" : "CREATE_REJECTED",
      lastError: uncertain ? "Hasil pembuatan Snap belum pasti. Sistem memeriksa; jangan membayar ulang." : "Midtrans menolak pembuatan Snap. Periksa key dan environment pada pengaturan.", leaseToken: null, leaseUntil: null } });
    throw new HttpError("Snap belum dapat dibuka. Hasil tersimpan untuk pemeriksaan; pembayaran tidak dialihkan ke transfer manual.", 503);
  }
}
async function credentials(attempt: BoundAttempt) {
  // A rotated key can verify older payments ONLY in the same merchant/environment.
  const newer = await prisma.midtransConfiguration.findMany({ where: { storeScope: scope(), merchantId: attempt.configuration.merchantId,
    environment: attempt.configuration.environment, id: { not: attempt.configId } }, orderBy: { createdAt: "desc" }, take: 4 });
  return [attempt.configuration, ...newer];
}
async function getStatus(attempt: BoundAttempt) {
  let last: unknown;
  for (const config of await credentials(attempt)) {
    try {
      const data = await statusRequest(config.environment, serverKey(config), attempt.providerOrderId);
      // A replacement key may have been pasted from another merchant. A 404 has
      // no merchant identity, so it cannot authorize expiry after key rotation.
      if (!data && config.id !== attempt.configId) { last = new MidtransRequestError(503, true); continue; }
      return data;
    }
    catch (error) { last = error; if (!(error instanceof MidtransRequestError && error.status === 401)) throw error; }
  }
  throw last;
}
function validateStatus(attempt: BoundAttempt, data: ProviderStatus) {
  if (data.order_id !== attempt.providerOrderId || data.merchant_id !== attempt.configuration.merchantId ||
      rupiah(data.gross_amount) !== attempt.amount || data.currency !== "IDR" ||
      typeof data.transaction_id !== "string" || !/^[A-Za-z0-9._:-]{1,150}$/.test(data.transaction_id) ||
      (attempt.transactionId && data.transaction_id !== attempt.transactionId))
    throw new HttpError("Identitas, merchant, mata uang, atau nominal Midtrans tidak sesuai. Perlu pemeriksaan seller.", 409);
}
async function applyStatus(attempt: BoundAttempt, data: ProviderStatus | null, lease: string) {
  if (data) validateStatus(attempt, data);
  return prisma.$transaction(async tx => {
    await lockPaymentOrder(tx, attempt.paymentId);
    const current = await tx.midtransAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    if (current.leaseToken !== lease) return { deferred: true };
    if (data) validateStatus({ ...current, configuration: attempt.configuration }, data);
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: attempt.paymentId }, include: { order: { include: { items: true } } } });
    if (payment.provider !== "midtrans" || payment.method !== MIDTRANS_METHOD || payment.amount !== attempt.amount || payment.order.total !== attempt.amount)
      throw new HttpError("Snapshot tagihan tidak konsisten; perlu pemeriksaan seller", 409);
    const now = new Date();
    const eventData = data ? safeStatus(data) : { transaction_status: "not_found" };
    await tx.midtransEvent.upsert({ where: { fingerprint: hash(`${attempt.id}:status:${JSON.stringify(eventData)}`) },
      create: { id: randomUUID(), attemptId: attempt.id, kind: "STATUS", fingerprint: hash(`${attempt.id}:status:${JSON.stringify(eventData)}`), data: eventData, processedAt: now }, update: { processedAt: now } });
    const base = { lastCheckedAt: now, nextCheckAt: new Date(Date.now() + 90_000), leaseToken: null, leaseUntil: null, lastError: null };
    if (!data) {
      // 404 is normal before channel selection. Only release after the fixed provider deadline + grace.
      const elapsed = Date.now() > attempt.expiresAt.getTime() + 120_000;
      await tx.midtransAttempt.update({ where: { id: attempt.id }, data: { ...base, ...(elapsed && payment.status !== "PAID" ? { state: "NOT_FOUND_EXPIRED", closedAt: now } : {}) } });
      return { notFound: true };
    }
    const state = data.transaction_status || "unknown";
    const successful = state === "settlement" || (state === "capture" && data.payment_type === "credit_card" && data.fraud_status === "accept");
    const identity = hash(JSON.stringify([scope(), attempt.configuration.environment, attempt.configuration.merchantId, data.transaction_id]));
    const another = await tx.midtransAttempt.findUnique({ where: { transactionIdentity: identity } });
    if (another && another.id !== attempt.id) throw new HttpError("Transaksi sumber telah terikat pada pembayaran lain", 409);
    let next = successful ? "PAID" : MIDTRANS_TERMINAL.includes(state) ? "TERMINAL" : state === "pending" ? "PENDING" : "REVIEW";
    if (["refund", "partial_refund"].includes(state)) next = "REFUND_REVIEW";
    const paidAlready = payment.status === "PAID" || payment.status === "REFUNDED";
    if (successful && paidAlready && !["PAID", "REFUND_REVIEW"].includes(current.state)) next = "DUPLICATE_PAYMENT_REVIEW";
    const stale = paidAlready && !successful && !["refund", "partial_refund"].includes(state);
    if (successful && !paidAlready) {
      if (payment.order.status !== "PENDING_PAYMENT" || !["PENDING_PAYMENT", "WAITING_VERIFICATION"].includes(payment.status)) next = "LATE_PAYMENT_REVIEW";
      else {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "WAITING_VERIFICATION" } });
        await settlePaymentInTransaction(tx, { ...payment, status: "WAITING_VERIFICATION" }, "system", `Midtrans ${state} · ${attempt.providerOrderId}`);
        const staff = await tx.user.findMany({ where: { isActive: true, deletedAt: null, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.PAYMENT_READ } } } } } } }, select: { id: true }, take: 50 });
        if (staff.length) await tx.notification.createMany({ data: staff.map(user => ({ userId: user.id, type: "payment", title: "Pembayaran Midtrans diterima", body: `Pesanan ${payment.order.orderNumber} telah lunas dan dapat disiapkan.` })) });
      }
    }
    const exception = ["REVIEW", "REFUND_REVIEW", "LATE_PAYMENT_REVIEW", "DUPLICATE_PAYMENT_REVIEW"].includes(next) || (stale && ["deny", "failure", "cancel", "expire"].includes(state));
    const fingerprint = hash(`${attempt.id}:exception:${state}`);
    if (exception && !await tx.midtransEvent.findUnique({ where: { fingerprint } })) {
      await tx.midtransEvent.create({ data: { id: randomUUID(), attemptId: attempt.id, kind: "REVIEW", fingerprint, data: eventData, processedAt: now } });
      await tx.auditLog.create({ data: { action: "midtrans.review_required", entity: "Payment", entityId: payment.id,
        meta: { providerOrderId: attempt.providerOrderId, state, orderId: payment.orderId } } });
    }
    await tx.midtransAttempt.update({ where: { id: attempt.id }, data: { ...base,
      nextCheckAt: new Date(Date.now() + (next === "PAID" ? 86400_000 : next === "PENDING" ? 90_000 : 15 * 60_000)),
      transactionId: data.transaction_id, transactionIdentity: identity, channel: data.payment_type,
      providerStatus: stale ? current.providerStatus : state, fraudStatus: data.fraud_status,
      state: stale ? current.state : next,
      ...(exception ? { lastError: "Status memerlukan pemeriksaan seller. Pesanan tidak dihidupkan kembali dan tidak ada refund otomatis." } : {}),
      ...(next === "TERMINAL" || next === "PAID" ? { closedAt: now } : {}) } });
    await tx.midtransEvent.updateMany({ where: { attemptId: attempt.id, kind: "WEBHOOK", processedAt: null }, data: { processedAt: now, lastError: null } });
    return { status: state, paid: successful && next === "PAID" };
  });
}
export async function syncAttempt(id: string, force = false) {
  const lease = randomUUID();
  const claimed = await prisma.midtransAttempt.updateMany({ where: { id, configuration: { storeScope: scope() },
    AND: [{ OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, ...(force ? [] : [{ nextCheckAt: { lte: new Date() } }])] },
    data: { leaseToken: lease, leaseUntil: new Date(Date.now() + 45_000), nextCheckAt: new Date(Date.now() + 90_000) } });
  if (!claimed.count) return { deferred: true };
  const attempt = await prisma.midtransAttempt.findUniqueOrThrow({ where: { id }, include: { configuration: true } });
  try { return await applyStatus(attempt, await getStatus(attempt), lease); }
  catch (error) {
    const message = error instanceof HttpError ? error.message : error instanceof MidtransRequestError && error.status === 401
      ? "Kredensial Midtrans ditolak (401). Periksa Server Key dan environment; worker akan mencoba lagi."
      : error instanceof MidtransRequestError && error.status === 429 ? "Batas permintaan Midtrans tercapai. Worker akan mencoba kembali tanpa menerbitkan pembayaran baru."
      : "Pemeriksaan Midtrans tertunda. Key, jaringan, atau layanan provider perlu diperiksa; worker akan mencoba lagi.";
    await prisma.midtransAttempt.updateMany({ where: { id, leaseToken: lease }, data: { leaseToken: null, leaseUntil: null, lastError: message, lastCheckedAt: new Date() } });
    const fingerprint = hash(`${id}:error:${message}`);
    await prisma.midtransEvent.upsert({ where: { fingerprint }, create: { id: randomUUID(), attemptId: id, kind: "ERROR", fingerprint,
      data: { reason: message }, processedAt: new Date(), lastError: message }, update: { receivedAt: new Date(), lastError: message } });
    await prisma.midtransEvent.updateMany({ where: { attemptId: id, kind: "WEBHOOK", processedAt: null }, data: { lastError: message } });
    return { deferred: true };
  }
}
export async function checkPayment(paymentId: string) {
  const attempt = await prisma.midtransAttempt.findFirst({ where: { paymentId, configuration: { storeScope: scope() } }, orderBy: { createdAt: "desc" } });
  if (!attempt) throw new HttpError("Percobaan tidak ditemukan", 404);
  if (attempt.lastCheckedAt && Date.now() - attempt.lastCheckedAt.getTime() < 30_000) return { deferred: true };
  return syncAttempt(attempt.id, true);
}
export async function webhook(raw: Record<string, unknown>) {
  if (typeof raw.order_id !== "string" || raw.order_id.length > 50 || typeof raw.signature_key !== "string" || !/^[a-f0-9]{128}$/i.test(raw.signature_key) ||
      typeof raw.status_code !== "string" || !/^\d{3}$/.test(raw.status_code) || rupiah(raw.gross_amount) === null)
    throw new HttpError("Notifikasi tidak valid", 400);
  const attempt = await prisma.midtransAttempt.findFirst({ where: { providerOrderId: raw.order_id, configuration: { storeScope: scope() } }, include: { configuration: true } });
  if (!attempt) throw new HttpError("Notifikasi tidak dikenal", 404);
  let verified = false;
  for (const config of await credentials(attempt)) {
    const expected = createHash("sha512").update(String(raw.order_id) + raw.status_code + String(raw.gross_amount) + serverKey(config)).digest();
    if (timingSafeEqual(expected, Buffer.from(raw.signature_key, "hex"))) { verified = true; break; }
  }
  if (!verified || raw.merchant_id !== attempt.configuration.merchantId || rupiah(raw.gross_amount) !== attempt.amount) throw new HttpError("Notifikasi tidak sah", 403);
  const data = safeStatus(raw as ProviderStatus), fingerprint = hash(`${attempt.id}:webhook:${JSON.stringify(data)}`);
  await prisma.midtransEvent.upsert({ where: { fingerprint }, create: { id: randomUUID(), attemptId: attempt.id, kind: "WEBHOOK", fingerprint, data }, update: {} });
  const result = await syncAttempt(attempt.id, true);
  // Accepted means durable queue, not proof of payment. Provider failure requests retry as well.
  const current = await prisma.midtransAttempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { lastError: true } });
  if (result.deferred && current.lastError) throw new HttpError("Notifikasi tersimpan; verifikasi provider tertunda", 503);
  return { received: true };
}
export async function runMidtransWorker() {
  const started = Date.now(); let checked = 0;
  const attempts = await prisma.midtransAttempt.findMany({ where: { configuration: { storeScope: scope() }, nextCheckAt: { lte: new Date() },
    OR: [{ closedAt: null }, { events: { some: { kind: "WEBHOOK", processedAt: null } } }, { createdAt: { gt: new Date(Date.now() - 7 * 86400_000) } }] },
    orderBy: { nextCheckAt: "asc" }, select: { id: true }, take: 12 });
  for (const attempt of attempts) { if (Date.now() - started > 25_000) break; await syncAttempt(attempt.id); checked++; }
  return { checked };
}
/** Called outside lifecycle locks; transition rechecks this receipt under its order lock. */
export async function prepareExpiry(paymentId: string) {
  const attempts = await prisma.midtransAttempt.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const deadline = Date.now() + 20_000;
  // Reconcile earlier attempts too; a later attempt cannot prove an older one unpaid.
  // If the bounded sweep cannot finish, assertSafeExpiry keeps the reservation.
  for (const attempt of attempts) { if (Date.now() > deadline) break; await syncAttempt(attempt.id, true); }
}
export async function assertSafeExpiry(tx: Prisma.TransactionClient, paymentId: string) {
  const attempts = await tx.midtransAttempt.findMany({ where: { paymentId }, orderBy: { createdAt: "desc" } });
  if (!attempts.length || attempts.some(a => !["TERMINAL", "NOT_FOUND_EXPIRED"].includes(a.state) || !a.lastCheckedAt ||
      Date.now() - a.lastCheckedAt.getTime() > 60_000 || a.expiresAt.getTime() + 120_000 > Date.now() || a.lastError))
    throw new HttpError("Status Midtrans belum aman untuk melepas reservasi. Rekonsiliasi akan diulang.", 409);
}
