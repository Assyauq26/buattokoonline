import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { parseBluEmail } from "./blu-email";
import { ingestObservation, lockSource, observationFingerprint, requirePreview, storeScope } from "./repository";
import { verifyBluDkim } from "./blu-dkim";

/** Internal review-only seam. No scheduler/checkout activation or public upload
 * endpoint is installed. Existing lease/generation locks are checked at commit. */
export async function ingestBluEmailReview(input: {
  sourceId: string;
  generation: number;
  leaseToken: string;
  raw: Uint8Array;
  apiMessageId?: string;
}) {
  requirePreview();
  const source = await prisma.paymentEvidenceSource.findFirst({
    where: { id: input.sourceId, storeScope: storeScope(), kind: "GMAIL_BANK" },
    select: { id: true },
  });
  if (!source)
    throw new HttpError("Sumber notifikasi bank tidak ditemukan", 404);
  const parsed = await parseBluEmail(input.raw, input.apiMessageId);
  const signature = parsed.observation.amount !== null
    ? await verifyBluDkim(input.raw)
    : null;
  const evidenceId = await ingestObservation(
    source.id,
    input.generation,
    input.leaseToken,
    parsed.observation,
  );
  if (signature) await prisma.$transaction(async tx => {
    const s = await lockSource(tx, source.id);
    if (s.generation !== input.generation || s.leaseToken !== input.leaseToken || !s.leaseUntil || s.leaseUntil <= new Date())
      throw new HttpError("Koneksi berubah; ulangi pemeriksaan", 409);
    const reason = JSON.stringify({ ...signature, observationFingerprint: observationFingerprint(parsed.observation) });
    const previous = await tx.paymentEvidenceReview.findFirst({ where: { sourceId: source.id, evidenceId, action: "BLU_SIGNATURE_CHECK" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { reason: true } });
    if (previous?.reason !== reason) await tx.paymentEvidenceReview.create({ data: {
      sourceId: source.id, evidenceId, action: "BLU_SIGNATURE_CHECK", reason,
    } });
  });
  return {
    evidenceId,
    disposition: parsed.disposition,
    reasons: parsed.reasons,
  };
}
