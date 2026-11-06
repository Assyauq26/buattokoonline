import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { storeOrigin } from "@/lib/store-config";
import { HttpError } from "@/lib/response";
import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { registrationMailConfig } from "@/modules/auth/registration-otp-email";
import {
  completeSellerReset, deliverSellerReset, notifySellerReset, sellerResetLimit, verifySellerReset,
} from "@/modules/auth/seller-password-reset";

const password = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: z.string().trim().toLowerCase().max(254).email() }),
  z.object({ action: z.literal("verify"), id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("complete"), token: z.string().regex(/^[a-f0-9]{64}$/), password, confirmation: z.string().max(72) }),
]);
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== storeOrigin() ||
        req.headers.get("content-type")?.split(";")[0] !== "application/json")
      return reply({ error: "Permintaan tidak diizinkan." }, 403);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Periksa kembali data yang Anda masukkan." }, 400);
    const data = parsed.data;
    // The store is bound behind Caddy. Use the final proxy-supplied address.
    const forwarded = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "";
    await sellerResetLimit(data.action, "ip", isIP(forwarded) ? forwarded : "unknown",
      data.action === "request" ? 15 : 60);
    if (data.action === "request") {
      await enforceAuthRateLimit("sellerResetRequest", data.email);
      registrationMailConfig();
      const id = randomUUID();
      after(async () => {
        try { await deliverSellerReset(data.email, id); }
        catch { console.warn("auth.seller_reset.otp_delivery_failed"); }
      });
      return reply({ id, message: "Jika email terdaftar, kami akan mengirimkan kode verifikasi." }, 202);
    }
    if (data.action === "verify") return reply({ token: await verifySellerReset(data.id, data.code) });
    if (data.password !== data.confirmation) return reply({ error: "Konfirmasi password tidak cocok." }, 400);
    const email = await completeSellerReset(data.token, data.password);
    after(async () => {
      try { await notifySellerReset(email); }
      catch { console.warn("auth.seller_reset.notification_failed"); }
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return reply({ error: error.message }, error.status);
    console.warn("auth.seller_reset.request_failed");
    return reply({ error: "Layanan pemulihan belum tersedia. Coba lagi nanti." }, 503);
  }
}
