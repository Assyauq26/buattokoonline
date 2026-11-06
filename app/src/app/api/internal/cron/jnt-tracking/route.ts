import { timingSafeEqual } from "node:crypto";
import { syncDailyJntTracking } from "@/modules/shipping/jnt-tracking.service";
import { handle, fail, ok } from "@/lib/response";

export const dynamic = "force-dynamic";

/** The local maintenance timer supplies the store's bearer secret. */
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || "";
    if (secret.length < 16) return fail("Cron belum dikonfigurasi", 503);
    const expected = Buffer.from(`Bearer ${secret}`);
    const received = Buffer.from(req.headers.get("authorization") || "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received))
      return fail("Tidak diizinkan", 401);
    return ok(await syncDailyJntTracking());
  });
}
