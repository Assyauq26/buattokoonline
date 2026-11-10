import { timingSafeEqual } from "node:crypto";
import { handle, fail, ok } from "@/lib/response";
import { drainWhatsAppOutbox } from "@/modules/whatsapp/outbox";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET || "";
    if (secret.length < 32) return fail("Worker belum dikonfigurasi", 503);
    const expected = Buffer.from("Bearer " + secret),
      received = Buffer.from(req.headers.get("authorization") || "");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      return fail("Tidak diizinkan", 401);
    return ok(await drainWhatsAppOutbox());
  });
}
