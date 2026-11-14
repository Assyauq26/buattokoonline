import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import {
  acquireSourceLease,
  finishSourceLease,
  lockSource,
  requirePreview,
  storeScope,
} from "./repository";
import {
  getGmailRawMessage,
  listGmailMessages,
  refreshGoogle,
  type GoogleTokens,
} from "./google";
import { seal, unseal } from "./secrets";
import { ingestBluEmailReview } from "./blu-ingestion";

/** One admin-triggered, bounded read. No timer, checkout, claims or settlement.
 * Partial/retried reads overlap and use durable source/message deduplication. */
export async function reviewGmailNow(actorId: string, sourceId: string) {
  requirePreview();
  if (process.env.PAYMENT_GMAIL_OAUTH_TEST !== "true")
    throw new HttpError("Uji Gmail belum dikonfigurasi operator", 503);
  // Permission is checked again before acquiring a lease and committing tokens.
  const source = await prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    const s = await lockSource(tx, sourceId);
    if (
      s.kind !== "GMAIL_BANK" ||
      !s.encryptedSecret ||
      s.health === "RECONNECT_REQUIRED"
    )
      throw new HttpError("Hubungkan Gmail terlebih dahulu", 409);
    return s;
  });
  const lease = await acquireSourceLease(
    sourceId,
    new Date(),
    source.generation,
  );
  if (!lease)
    throw new HttpError(
      "Pembacaan sedang berjalan atau jeda satu menit belum selesai",
      409,
    );
  let count = 0;
  try {
    // Re-read under the acquired generation; disconnect/reconnect cannot supply
    // stale credentials for a newer generation.
    const current = await prisma.paymentEvidenceSource.findFirst({
      where: {
        id: sourceId,
        storeScope: storeScope(),
        generation: lease.generation,
        leaseToken: lease.token,
      },
    });
    if (!current?.encryptedSecret || current.generation !== source.generation)
      throw new HttpError("Koneksi berubah; ulangi pemeriksaan", 409);
    const saved = JSON.parse(
      unseal(current.encryptedSecret, storeScope(), sourceId, "google-tokens"),
    ) as GoogleTokens;
    if (!saved.access || !saved.refresh || !Number.isFinite(saved.expiresAt))
      throw new Error("Invalid token envelope");
    const tokens = await refreshGoogle(saved);
    await prisma.$transaction(async (tx) => {
      await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
      const s = await lockSource(tx, sourceId);
      if (
        s.generation !== lease.generation ||
        s.leaseToken !== lease.token ||
        !s.leaseUntil ||
        +s.leaseUntil <= Date.now()
      )
        throw new HttpError("Koneksi berubah; ulangi pemeriksaan", 409);
      await tx.paymentEvidenceSource.update({
        where: { id: sourceId },
        data: {
          encryptedSecret: seal(
            JSON.stringify(tokens),
            storeScope(),
            sourceId,
            "google-tokens",
          ),
        },
      });
    });
    // Fixed first-day scan, replayed on demand. Only blu-shaped messages selected;
    // the query is a privacy preference, not proof of sender authenticity.
    let since = new Date(Date.now() - 24 * 60 * 60_000),
      cursor: string | undefined;
    if (lease.cursor) {
      const resume = JSON.parse(lease.cursor) as {
        since: number;
        page: string;
      };
      if (
        !Number.isFinite(resume.since) ||
        resume.since > Date.now() ||
        resume.since < Date.now() - 7 * 86400_000 ||
        typeof resume.page !== "string" ||
        resume.page.length > 4096
      )
        throw new Error("Invalid review cursor");
      since = new Date(resume.since);
      cursor = resume.page;
    }
    const page = await listGmailMessages(tokens.access, since, cursor, true);
    // Five raw messages keeps the operation below the 120-second lease even
    // when Google reaches its per-request timeout. No cursor advances on failure.
    for (const message of (page.messages || []).slice(0, 5)) {
      const raw = await getGmailRawMessage(tokens.access, message.id);
      await ingestBluEmailReview({
        sourceId,
        generation: lease.generation,
        leaseToken: lease.token,
        ...raw,
      });
      count++;
    }
    if ((page.messages?.length || 0) > 5)
      throw new Error("Review page too large");
    await finishSourceLease(sourceId, lease.token, lease.generation, {
      ok: true,
      cursor: page.nextPageToken
        ? JSON.stringify({ since: +since, page: page.nextPageToken })
        : "",
    });
    return { count, limited: !!page.nextPageToken, reviewOnly: true };
  } catch (error) {
    try {
      await finishSourceLease(sourceId, lease.token, lease.generation, {
        ok: false,
        authFailed: error instanceof HttpError && error.status === 409,
      });
    } catch {
      /* A newer generation owns the source; never overwrite it. */
    }
    // Never expose raw mail, provider error bodies, URLs or token material.
    throw new HttpError(
      error instanceof HttpError && error.status === 409
        ? "Gmail perlu dihubungkan ulang atau koneksi berubah"
        : "Pembacaan Gmail belum selesai. Coba lagi setelah jeda; bukti yang tersimpan tetap dipertahankan.",
      409,
    );
  }
}
