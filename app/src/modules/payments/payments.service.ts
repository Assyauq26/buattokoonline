import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { canTransitionPayment } from "@/modules/payments/domain/state-machine";
import { commitSale } from "@/modules/inventory/inventory.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission, lockOrder, lockPaymentOrder } from "@/modules/orders/transaction-locks";
import { writeAudit } from "@/modules/audit/audit.service";

export function listActiveBankAccounts() {
  return prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}

/** Customer submits transfer proof -> WAITING_VERIFICATION. */
export async function submitConfirmation(
  userId: string,
  orderId: string,
  input: {
    senderBank: string;
    senderName: string;
    amount: number;
    transferDate: Date;
    proofPath: string;
    proofMime: string;
    note?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findFirst({ where: { id: orderId, userId }, include: { payment: true } });
    if (!order?.payment) throw new HttpError("Order tidak ditemukan", 404);
    const payment = order.payment;
    if (order.status !== "PENDING_PAYMENT" || (order.expiresAt && order.expiresAt < new Date()) || !canTransitionPayment(payment.status, "WAITING_VERIFICATION")) throw new HttpError("Order tidak menerima konfirmasi pembayaran", 409);
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || !Number.isFinite(input.transferDate.getTime())) throw new HttpError("Konfirmasi pembayaran tidak valid", 422);
    await tx.paymentConfirmation.create({
      data: {
        paymentId: payment.id,
        senderBank: input.senderBank,
        senderName: input.senderName,
        amount: input.amount,
        transferDate: input.transferDate,
        proofPath: input.proofPath,
        proofMime: input.proofMime,
        note: input.note,
        status: "SUBMITTED",
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "WAITING_VERIFICATION" },
    });
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: "WAITING_VERIFICATION" },
    });
    await writeAudit(
      { userId, action: "payment.confirm", entity: "Payment", entityId: payment.id, meta: { orderId } },
      tx,
    );
    return updated;
  });
}

export function listPendingVerifications(search?: string) {
  return prisma.payment.findMany({
    where: {
      status: "WAITING_VERIFICATION",
      ...(search
        ? { order: { orderNumber: { contains: search, mode: "insensitive" } } }
        : {}),
    },
    include: {
      order: { include: { user: { select: { name: true, email: true } } } },
      bankAccount: true,
      confirmations: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "asc" },
  });
}

export function getPaymentDetail(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: { include: { items: true, address: true, user: true } },
      bankAccount: true,
      confirmations: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** Lock the order before reading payment state; successful replays have no side effects. */
export async function approvePayment(paymentId: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, adminId, PERMISSIONS.PAYMENT_VERIFY);
    await lockPaymentOrder(tx, paymentId);
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { items: { orderBy: { variantId: "asc" } } } }, confirmations: { orderBy: { createdAt: "desc" } } },
    });
    if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
    if (["CANCELLED", "EXPIRED", "REFUNDED"].includes(payment.order.status)) throw new HttpError("Order tidak menerima approval pembayaran", 409);
    if (payment.status === "PAID") {
      if (payment.order.paymentStatus !== "PAID" || payment.order.status === "PENDING_PAYMENT") throw new HttpError("Status order dan pembayaran tidak konsisten", 409);
      return { ok: true };
    }
    if (payment.order.status !== "PENDING_PAYMENT") throw new HttpError("Order tidak menerima approval pembayaran", 409);
    if (!canTransitionPayment(payment.status, "PAID")) {
      throw new HttpError("Pembayaran tidak dalam status menunggu verifikasi", 409);
    }

    const latest = payment.confirmations.find((c) => c.status === "SUBMITTED");
    if (!latest) throw new HttpError("Bukti pembayaran belum tersedia", 409);
    // A proof submitted before the deadline must remain reviewable afterward.
    // Financial staff still need to verify settlement against the actual bank.
    if (payment.order.expiresAt && latest.createdAt > payment.order.expiresAt)
      throw new HttpError("Bukti pembayaran diajukan setelah tenggat", 409);
    if (latest) {
      await tx.paymentConfirmation.update({
        where: { id: latest.id },
        data: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date() },
      });
    }
    await tx.payment.update({ where: { id: paymentId }, data: { status: "PAID" } });

    // Convert reserved stock into a committed sale.
    for (const item of payment.order.items) {
      await commitSale(tx, item.variantId, item.quantity, payment.order.orderNumber);
    }

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: "PAID", paymentStatus: "PAID" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        fromStatus: payment.order.status,
        toStatus: "PAID",
        note: "Pembayaran diverifikasi",
        createdBy: adminId,
      },
    });
    await tx.notification.create({
      data: {
        userId: payment.order.userId,
        type: "payment",
        title: "Pembayaran dikonfirmasi",
        body: `Pembayaran untuk order ${payment.order.orderNumber} telah diverifikasi.`,
      },
    });
    await writeAudit(
      { userId: adminId, action: "payment.approve", entity: "Payment", entityId: paymentId, meta: { orderId: payment.orderId } },
      tx,
    );
    return { ok: true };
  });
}

/** Admin rejects with a reason -> customer can re-upload. */
export async function rejectPayment(paymentId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new HttpError("Alasan penolakan wajib diisi", 400);
  return prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, adminId, PERMISSIONS.PAYMENT_VERIFY);
    await lockPaymentOrder(tx, paymentId);
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: true, confirmations: { orderBy: { createdAt: "desc" } } },
    });
    if (!payment) throw new HttpError("Pembayaran tidak ditemukan", 404);
    if (payment.order.status !== "PENDING_PAYMENT") throw new HttpError("Order tidak menerima verifikasi pembayaran", 409);
    if (!canTransitionPayment(payment.status, "REJECTED")) {
      throw new HttpError("Pembayaran tidak dalam status menunggu verifikasi", 409);
    }
    const latest = payment.confirmations.find((c) => c.status === "SUBMITTED");
    if (!latest) throw new HttpError("Bukti pembayaran belum tersedia", 409);
    if (payment.order.expiresAt && latest.createdAt > payment.order.expiresAt)
      throw new HttpError("Bukti pembayaran diajukan setelah tenggat", 409);
    if (latest) {
      await tx.paymentConfirmation.update({
        where: { id: latest.id },
        data: { status: "REJECTED", rejectionReason: reason, reviewedBy: adminId, reviewedAt: new Date() },
      });
    }
    await tx.payment.update({ where: { id: paymentId }, data: { status: "REJECTED" } });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "REJECTED" },
    });
    await tx.notification.create({
      data: {
        userId: payment.order.userId,
        type: "payment",
        title: "Pembayaran ditolak",
        body: `Bukti transfer untuk order ${payment.order.orderNumber} ditolak: ${reason}`,
      },
    });
    await writeAudit(
      { userId: adminId, action: "payment.reject", entity: "Payment", entityId: paymentId, meta: { reason } },
      tx,
    );
    return { ok: true };
  });
}
