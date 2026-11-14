import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { parseBluEmail } from "./blu-email";
import { ingestObservation, requirePreview, storeScope } from "./repository";

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
  const evidenceId = await ingestObservation(
    source.id,
    input.generation,
    input.leaseToken,
    parsed.observation,
  );
  return {
    evidenceId,
    disposition: parsed.disposition,
    reasons: parsed.reasons,
  };
}
