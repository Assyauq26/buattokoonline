import { z } from "zod";
import { postPinnedJnt } from "@/infrastructure/shipping/jnt/pinned-https";
import { validateEndpoint } from "@/infrastructure/shipping/jnt/official-config";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, HttpError, ok } from "@/lib/response";
import { isJntSettingsAdministrator, jntSettingsInput, resolveJntDraft, requireProbeEnvironment, requireEz } from "@/infrastructure/shipping/jnt/official-config";
import { districtCodePattern, mappedDestination } from "@/infrastructure/shipping/jnt/verified-mapping";
import { checkJntRate, trackJntOrder } from "@/infrastructure/shipping/jnt/official-transport";
import { issueTariffProof } from "@/infrastructure/shipping/jnt/tariff-proof";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";

export const dynamic = "force-dynamic";
const input = z.union([z.object({ endpoint: z.literal("all"), draft: z.object({ environment: jntSettingsInput.shape.environment, endpoints: jntSettingsInput.shape.endpoints }) }).strict(), z.object({
  draft: jntSettingsInput,
  endpoint: z.enum(["order", "tariff", "tracking", "cancellation"]),
  destinationDistrictCode: z.string().regex(districtCodePattern).optional(),
  weightGram: z.number().int().min(1).max(100000).optional(),
  awb: z.string().regex(/^[A-Z0-9]{8,30}$/).optional(),
  ownsAwb: z.boolean().optional(),
}).strict()]);

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser(false);
    if (!user) throw new HttpError("Harap login", 401);
    if (!isJntSettingsAdministrator(user)) throw new HttpError("Akses ditolak", 403);
    const parsed = input.safeParse(await readJntJson(req, 16_384));
    if (!parsed.success) throw new HttpError("Parameter uji tidak valid", 422);
    const value = parsed.data;
    const minute = Math.floor(Date.now() / 60000);
    await consumeAuthBucket("jnt-test:" + minute + ":" + user.id, 5, new Date((minute + 2) * 60000));
    if (value.endpoint === "all") {
      // HEAD never invokes Create Order/Cancel POST and carries no order data.
      const results = await Promise.all((["order", "tariff", "tracking", "cancellation"] as const).map(async endpoint => {
        validateEndpoint(endpoint, value.draft.endpoints[endpoint], value.draft.environment);
        try {
          const response = await postPinnedJnt(value.draft.endpoints[endpoint], "", {}, "HEAD");
          await response.body?.cancel();
          return { endpoint, status: response.status, ok: response.status === 200,
            message: response.status === 200 ? "Terhubung · HTTP 200" : "HTTP " + response.status + (response.status === 405 ? " · endpoint tidak mendukung tes HEAD" : "") };
        } catch {
          return { endpoint, status: null, ok: false, message: "Koneksi tidak berhasil. Periksa endpoint dan jaringan." };
        }
      }));
      const response = ok({ results, message: results.every(result => result.ok)
        ? "Semua endpoint merespons HTTP 200. Tes ini memeriksa konektivitas, bukan validitas kredensial."
        : "Tes selesai. Beberapa endpoint belum merespons HTTP 200." });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const { config, version, releaseStamp } = await resolveJntDraft(value.draft);
    const environment = value.draft.environment;
    let result: { status: string; message: string; tariffProof?: string } = {
      status: "SAFE_PROBE_UNAVAILABLE", message: "Konfigurasi valid. J&T tidak mendokumentasikan uji autentikasi aman untuk operasi ini.",
    };
    if (value.endpoint === "tariff") {
      requireProbeEnvironment(environment);
      requireEz(config);
      if (!value.destinationDistrictCode || !value.weightGram) throw new HttpError("Pilih kecamatan tujuan dan berat uji", 422);
      const mapping = await mappedDestination(value.destinationDistrictCode, version);
      const rates = await checkJntRate({ originSite: config.seller!.warehouse.originSite, destinationArea: mapping.destAreaCode,
        weightGram: value.weightGram, productType: "EZ" }, config);
      if (rates.length !== 1 || rates[0].courier !== "J&T Express" || rates[0].service !== "EZ" ||
          !Number.isSafeInteger(rates[0].cost) || rates[0].cost <= 0 || rates[0].cost > 2_147_483_647) {
        throw new HttpError("J&T belum mengembalikan tarif EZ yang valid", 502);
      }
      result = { status: "AUTHENTICATED", message: "Cek tarif EZ berhasil.", tariffProof: issueTariffProof(config, environment, releaseStamp) };
    }
    if (value.endpoint === "tracking") {
      requireProbeEnvironment(environment);
      if (!value.awb || !value.ownsAwb) throw new HttpError("Masukkan resi sah milik toko dan konfirmasi izin penggunaannya", 422);
      const track = await trackJntOrder(value.awb, undefined, config);
      if (!track.events.length) throw new HttpError("J&T mengembalikan riwayat tracking kosong", 502);
      result = { status: "AUTHENTICATED", message: "Autentikasi dan riwayat resi uji terverifikasi." };
    }
    const response = ok({ endpoint: value.endpoint, ...result });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
