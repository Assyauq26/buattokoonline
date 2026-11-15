import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { allocateAmount } from "./policy";
import { lockSource, storeScope } from "./repository";
import { assertBluOperator } from "./blu-access";

export const BLU_CHECKOUT_METHOD = "blu_email_transfer";
export function bluCheckoutEnabled() {
  return process.env.PAYMENT_BLU_CHECKOUT_ENABLED === "true" &&
    process.env.PAYMENT_EVIDENCE_PREVIEW === "true" &&
    process.env.PAYMENT_GMAIL_OAUTH_TEST === "true" &&
    !!process.env.PAYMENT_GOOGLE_CLIENT_ID && !!process.env.PAYMENT_GOOGLE_CLIENT_SECRET &&
    /^[A-Za-z0-9+/]{43}=$/.test(process.env.PAYMENT_INTEGRATION_ENCRYPTION_KEY || "");
}

export async function listBluCheckoutSources() {
  if (!bluCheckoutEnabled()) return [];
  const sources=await prisma.paymentEvidenceSource.findMany({
    where: { storeScope: storeScope(), kind: "GMAIL_BANK", enabled: true,
      encryptedSecret: { not: null }, automationActorId: { not: null }, health: "REVIEW_ONLY",
      lastCheckedAt: { gte: new Date(Date.now() - 5 * 60_000) },
      bankAccount: { isActive: true, deletedAt: null } },
    select: { id: true, label: true, bankAccountId: true,generation:true,reviews:{where:{action:"BLU_AUTO_MATCH_OPT_IN"},orderBy:[{createdAt:"desc"},{id:"desc"}],take:1,select:{reason:true}} },
    orderBy: { createdAt: "asc" }, take: 30,
  });
  return sources.filter(s=>s.reviews[0]?.reason===`generation:${s.generation}`).map(({id,label,bankAccountId})=>({id,label,bankAccountId}));
}

/** Same transaction as the new order/payment and stock reservation. Source lock
 * serializes all code allocation; no existing order is locked after this source. */
export async function prepareBluCheckout(tx: Prisma.TransactionClient, sourceId: string,
  bankAccountId: string, baseAmount: number, consent: boolean, now = new Date()) {
  if (!bluCheckoutEnabled() || !consent) throw new HttpError("Konfirmasi kode unik blu diperlukan", 422);
  if (!Number.isSafeInteger(baseAmount) || baseAmount < 10_000)
    throw new HttpError("Total dasar transfer blu minimal Rp10.000", 422);
  const s = await lockSource(tx, sourceId);
  if (s.kind !== "GMAIL_BANK" || !s.enabled || !s.encryptedSecret || !s.automationActorId ||
      s.bankAccountId !== bankAccountId || s.health !== "REVIEW_ONLY" || !s.lastCheckedAt || +s.lastCheckedAt < +now - 5 * 60_000)
    throw new HttpError("Metode blu belum siap. Pilih pembayaran manual atau muat ulang.", 409);
  await assertBluOperator(tx, s.automationActorId);
  if(!await tx.paymentEvidenceReview.findFirst({where:{sourceId,action:"BLU_AUTO_MATCH_OPT_IN",reason:`generation:${s.generation}`},select:{id:true}}))throw new HttpError("Seller perlu mengonfirmasi aktivasi blu otomatis pada pengaturan",409);
  const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, isActive: true, deletedAt: null } });
  if (!bank) throw new HttpError("Rekening blu tidak tersedia", 409);
  const occupied = await tx.paymentEvidenceAttempt.findMany({
    where: { sourceId, retainUntil: { gt: now } }, select: { payable: true },
  });
  let amount;
  try { amount = allocateAmount(baseAmount, new Set(occupied.map(a => a.payable))); }
  catch { throw new HttpError("Kode unik sedang penuh. Gunakan transfer manual atau coba lagi nanti.", 409); }
  return { ...amount, sourceId, createdAt: now,
    expiresAt: new Date(+now + 10 * 60_000), retainUntil: new Date(+now + 10 * 60_000 + 7 * 86400_000) };
}
