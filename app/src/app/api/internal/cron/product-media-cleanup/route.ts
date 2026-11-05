import { timingSafeEqual } from "node:crypto";
import { cleanupStagedMedia } from "@/modules/catalog/staged-product-media";
import { handle, fail, ok } from "@/lib/response";

export const dynamic = "force-dynamic";

/** Dormant until an operator approves activation; no schedule is installed here. */
export async function GET(req: Request) {
  return handle(async () => {
    if (
      process.env.PRODUCT_MEDIA_CLEANUP_ENABLED !== "1" ||
      process.env.VERCEL_ENV !== "production"
    ) return fail("Cleanup belum diaktifkan", 503);
    const secret = process.env.CRON_SECRET || "";
    if (secret.length < 16) return fail("Cron belum dikonfigurasi", 503);
    const expected = Buffer.from(`Bearer ${secret}`);
    const received = Buffer.from(req.headers.get("authorization") || "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received))
      return fail("Tidak diizinkan", 401);
    const summary = await cleanupStagedMedia();
    // Counts only: no user/session IDs, object paths, provider body or credential.
    if (summary.failed) console.warn("[product-media-cleanup]", JSON.stringify(summary));
    else console.info("[product-media-cleanup]", JSON.stringify(summary));
    const counts = { ...summary, maxBatch: 5 };
    const response = summary.failed
      ? fail("Cleanup parsial; metadata dipertahankan untuk retry", 503, counts)
      : ok(counts);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
