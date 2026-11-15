import { timingSafeEqual } from "node:crypto";
import { handle, fail, ok } from "@/lib/response";
import { runMidtransWorker } from "@/modules/payments/midtrans/service";
export const dynamic = "force-dynamic";
export async function POST(req: Request) { return handle(async () => {
  const secret = process.env.CRON_SECRET || "", expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (secret.length < 16 || actual.length !== expected.length || !timingSafeEqual(expected, actual)) return fail("Tidak diizinkan", 401);
  return ok(await runMidtransWorker());
}); }
