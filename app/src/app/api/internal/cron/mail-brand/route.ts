import { timingSafeEqual } from "node:crypto";
import { handle, fail, ok } from "@/lib/response";
import { syncPendingMailBrand } from "@/modules/auth/mail-brand-sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || "";
    if (secret.length < 32) return fail("Worker belum dikonfigurasi", 503);
    const expected = Buffer.from("Bearer " + secret);
    const supplied = Buffer.from(req.headers.get("authorization") || "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      return fail("Tidak diizinkan", 401);
    await syncPendingMailBrand();
    return ok({ processed: true });
  });
}
