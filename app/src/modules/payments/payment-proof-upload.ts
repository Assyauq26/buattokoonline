import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { putObject, removeObject, STORAGE_APP } from "@/lib/storage";
import { validatePaymentProof } from "./payment-proof-validation";
import { submitConfirmation } from "./payments.service";

export interface PaymentProofFields {
  orderId: string;
  senderBank: string;
  senderName: string;
  amount: number;
  transferDate: string;
  note?: string;
}

/** Preflight before writing objects, with submitConfirmation enforcing again under order lock. */
async function assertUploadAllowed(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { status: true, expiresAt: true, payment: { select: { status: true } } },
  });
  if (!order?.payment) throw new HttpError("Pesanan tidak ditemukan", 404);
  if (order.status !== "PENDING_PAYMENT" ||
      (order.expiresAt && order.expiresAt < new Date()) ||
      !["PENDING_PAYMENT", "REJECTED"].includes(order.payment.status)) {
    throw new HttpError("Pesanan tidak menerima bukti pembayaran", 409);
  }
}

export async function uploadPaymentProof(userId: string, fields: PaymentProofFields, data: Uint8Array, mime: string) {
  const extension = validatePaymentProof(data, mime);
  const date = new Date(fields.transferDate);
  if (!Number.isSafeInteger(fields.amount) || fields.amount <= 0 ||
      !Number.isFinite(date.getTime()) || !fields.senderBank.trim() || !fields.senderName.trim()) {
    throw new HttpError("Konfirmasi pembayaran tidak valid", 422);
  }
  await assertUploadAllowed(userId, fields.orderId);
  const path = `${STORAGE_APP}/payment-proofs/${userId}/${randomUUID()}.${extension}`;
  const stored = await putObject(path, data, mime);
  if (stored.path !== path) throw new Error("Unexpected storage object path");
  try {
    return await submitConfirmation(userId, fields.orderId, {
      senderBank: fields.senderBank,
      senderName: fields.senderName,
      amount: fields.amount,
      transferDate: date,
      proofPath: stored.path,
      proofMime: mime,
      note: fields.note,
    });
  } catch (error) {
    // The DB transaction has failed. Never overwrite the business error if compensation fails.
    try { await removeObject(stored.path); }
    catch { console.error("[storage] Payment proof compensation failed"); }
    throw error;
  }
}
