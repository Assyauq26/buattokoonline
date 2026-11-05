import { z } from "zod";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, HttpError } from "@/lib/response";
import { isJntSettingsAdministrator, readJntSettings, jntEnvironment } from "@/infrastructure/shipping/jnt/official-config";
import { localJntSettings } from "@/infrastructure/shipping/jnt/seller-config";
import { getVerifiedJntDistrict } from "@/infrastructure/shipping/jnt/verified-mapping";
import { checkJntRate } from "@/infrastructure/shipping/jnt/official-transport";
import { writeAudit } from "@/modules/audit/audit.service";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
const input = z.object({
  environment: jntEnvironment, endpoint: z.enum(["order", "tariff", "tracking", "cancellation"]),
  destinationDistrictCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}$/).optional(),
  weightGram: z.number().int().min(1).max(100000).optional(),
}).strict();
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser(false);
    if (!user) throw new HttpError("Harap login", 401);
    if (!isJntSettingsAdministrator(user)) throw new HttpError("Akses ditolak", 403);
    if (!localJntSettings()) throw new HttpError("Uji konfigurasi hanya untuk toko lokal", 404);
    const parsed = input.safeParse(await readJntJson(req, 4096));
    if (!parsed.success) throw new HttpError("Parameter uji tidak valid", 422);
    const value = parsed.data;
    const minute = Math.floor(Date.now() / 60000);
    const identity = createHash("sha256").update(user.id).digest("hex");
    await consumeAuthBucket(`jnt-test:${minute}:${identity}`, 5, new Date((minute + 2) * 60000));
    const state = await readJntSettings(value.environment);
    if (!state) throw new HttpError("Simpan konfigurasi terlebih dahulu", 422);
    let status = "SAFE_PROBE_UNAVAILABLE";
    if (value.endpoint === "tariff") {
      if (!state.enabled) throw new HttpError("Aktifkan konfigurasi sebelum uji tarif", 422);
      if (value.environment === "production" && process.env.JNT_PRODUCTION_API_APPROVED !== "yes") throw new HttpError("Uji API Production belum disetujui operator lokal", 503);
      const cfg = state.config;
      const service = cfg.seller?.services.find(s => s.code === "EZ" && Date.parse(s.validUntil) > Date.now());
      if (!cfg.seller || !service || !value.destinationDistrictCode || !value.weightGram) throw new HttpError("Lengkapi gudang, persetujuan EZ yang berlaku, kecamatan tujuan dan berat uji", 422);
      const mapping = await getVerifiedJntDistrict(value.destinationDistrictCode);
      // Read-only Check Fee only. Never import Create Order or Cancellation here.
      const rates = await checkJntRate({ originSite: cfg.seller.warehouse.originSite, destinationArea: mapping.destinationArea,
        weightGram: value.weightGram, productType: "EZ" }, cfg);
      // HTTP 200 with no matching tariff is NOT proof that Check Fee works.
      if (rates.length !== 1 || rates[0].courier !== "J&T Express" || rates[0].service !== "EZ" ||
          !Number.isSafeInteger(rates[0].cost) || rates[0].cost < 0) {
        throw new HttpError("J&T belum mengembalikan tarif EZ yang valid", 502);
      }
      status = "CONNECTED";
    }
    await writeAudit({ userId: user.id, action: "jnt.integration.tested", entity: "JntIntegration",
      entityId: value.environment, meta: { environment: value.environment, endpoint: value.endpoint, status } });
    const response = NextResponse.json({ success: true, data: { endpoint: value.endpoint, status,
      message: status === "CONNECTED" ? "Check Fee resmi merespons. Ini bukan persetujuan checkout atau UAT Production." :
        "Belum tersedia probe autentikasi tanpa efek samping yang terverifikasi untuk endpoint ini. Tidak ada permintaan J&T dikirim." } });
    response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Vary", "Cookie");
    return response;
  });
}
