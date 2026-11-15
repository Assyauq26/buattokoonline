import { timingSafeEqual } from "node:crypto";
import { handle, fail, ok } from "@/lib/response";
import { runBluWorker } from "@/modules/payments/evidence/blu-worker";
import { runGoPayWorker } from "@/modules/payments/evidence/gopay-worker";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || "";
    if (secret.length < 16) return fail("Cron belum dikonfigurasi", 503);
    const expected = Buffer.from(`Bearer ${secret}`), received = Buffer.from(req.headers.get("authorization") || "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return fail("Tidak diizinkan", 401);
    const [blu,gopay]=await Promise.all([runBluWorker(),runGoPayWorker()]);
    const response = ok({...blu,gopay});
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
