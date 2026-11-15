import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { lockSource, requirePreview } from "./repository";
import { assertBluOperator } from "./blu-access";
import { bluCheckoutEnabled } from "./blu-checkout";
import { signatureAuditState } from "./signature-audit";
import { unseal } from "./secrets";
import { storeScope } from "./repository";
import { z } from "zod";

export async function setBluEnabled(actorId: string, sourceId: string, enabled: boolean, inspectOnly = false) {
  requirePreview();
  if (enabled && !bluCheckoutEnabled()) throw new HttpError("Checkout blu belum dibuka pada instalasi ini", 409);
  return prisma.$transaction(async tx => {
    await assertBluOperator(tx, actorId);
    const s = await lockSource(tx, sourceId);
    if (s.kind !== "GMAIL_BANK") throw new HttpError("Koneksi ini bukan rekening blu", 422);
    if (enabled) {
      if (!s.encryptedSecret || s.health === "RECONNECT_REQUIRED") throw new HttpError("Koneksi Gmail perlu dihubungkan ulang sebelum aktivasi",409);
      if (s.health !== "REVIEW_ONLY") throw new HttpError("Baca notifikasi blu untuk memverifikasi koneksi Gmail terlebih dahulu",409);
      if (!s.lastCheckedAt || +s.lastCheckedAt < Date.now()-5*60_000) throw new HttpError("Pemeriksaan Gmail sudah lebih dari lima menit. Klik Baca notifikasi blu, lalu aktifkan kembali.",409);
      if (!s.bankAccountId || !await tx.bankAccount.findFirst({ where: { id: s.bankAccountId, isActive: true, deletedAt: null } }))
        throw new HttpError("Rekening blu tidak aktif atau sudah dihapus. Pilih rekening penerima aktif.",409);
      try {
        z.object({ access: z.string().min(1).max(16000), refresh: z.string().min(1).max(16000),
          expiresAt: z.number().finite().positive() }).strict().parse(JSON.parse(unseal(s.encryptedSecret, storeScope(), sourceId, "google-tokens")));
      } catch { throw new HttpError("Sesi Gmail belum valid; hubungkan ulang sebelum mengaktifkan checkout", 409); }
      const evidence = await tx.incomingPaymentEvidence.findMany({ where: { sourceId, accountRef: s.accountRef,
        currency: "IDR", direction: "CREDIT", reason: "MISSING_STABLE_TRANSACTION_ID" }, orderBy: { createdAt: "desc" }, take: 20 });
      let verified = false;
      for (const e of evidence) {
        const audit = await tx.paymentEvidenceReview.findFirst({ where: { sourceId, evidenceId: e.id,
          action: "BLU_SIGNATURE_CHECK" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { reason: true } });
        if (signatureAuditState(e, audit?.reason).verified) { verified = true; break; }
      }
      if (!verified) throw new HttpError("Belum ada notifikasi blu dengan rekening dan tanda tangan yang terverifikasi", 409);
    }
    if (inspectOnly) return { enabled: s.enabled };
    if (s.enabled === enabled && (!enabled || s.automationActorId === actorId)) return { enabled };
    await tx.paymentEvidenceSource.update({ where: { id: sourceId }, data: {
      enabled, automationActorId: enabled ? actorId : null, generation: { increment: 1 },
      leaseToken: null, leaseUntil: null, cursor: null, nextPollAt: null,
    } });
    await tx.paymentEvidenceOAuthState.deleteMany({ where: { sourceId } });
    await tx.paymentEvidenceReview.create({ data: { sourceId, actorId,
      action: enabled ? "BLU_CHECKOUT_ENABLED" : "BLU_CHECKOUT_DISABLED",
      reason: enabled ? "Seller mengaktifkan notifikasi otomatis dan checkout berkode unik; hasil tidak pasti tetap diperiksa manual."
        : "Checkout dan pembacaan otomatis dihentikan; pesanan serta histori tetap dipertahankan." } });
    return { enabled };
  });
}

/** Same validation as activation, without mutating generation, tokens or source. */
export async function inspectBluReadiness(actorId: string, sourceId: string) {
  try { await setBluEnabled(actorId, sourceId, true, true); return { ready: true, reason: "Siap diaktifkan untuk pembayaran otomatis." }; }
  catch (error) {
    if (error instanceof HttpError) return { ready: false, reason: error.message };
    return { ready: false, reason: "Pemeriksaan kesiapan belum selesai. Muat ulang atau periksa layanan." };
  }
}
