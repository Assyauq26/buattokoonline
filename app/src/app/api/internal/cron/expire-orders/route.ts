import { timingSafeEqual } from "node:crypto";
import { expireStaleOrders } from "@/modules/orders/orders.service";
import { handle, fail, ok } from "@/lib/response";

export const dynamic = "force-dynamic";

/** Vercel supplies Authorization: Bearer CRON_SECRET on production cron calls. */
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || "";
    if (secret.length < 16) return fail("Cron belum dikonfigurasi", 503);
    const expected = Buffer.from(`Bearer ${secret}`);
    const received = Buffer.from(req.headers.get("authorization") || "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received))
      return fail("Tidak diizinkan", 401);
    const expired = await expireStaleOrders("system");
    return ok({ expired, maxBatch: 50 });
  });
}
