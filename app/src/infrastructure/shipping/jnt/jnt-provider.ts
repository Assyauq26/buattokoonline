import type { ShippingInquiry, ShippingProvider, ShippingRate } from "@/infrastructure/shipping/contracts/shipping-provider";
import { getJntAreaMappings } from "./jnt-config";
import { HttpError } from "@/lib/http-error";

/** Injectable for isolated tests; production uses the reviewed J&T transport. */
export interface OfficialJntTransport {
  inquire(input: ShippingInquiry & { originWarehouse: string; destinationArea: string }, signal: AbortSignal): Promise<ShippingRate[]>;
}
const known = ["EZ", "HBO", "JND", "ECO"] as const;
export class JntProvider implements ShippingProvider {
  readonly code = "jnt";
  readonly capabilities = ["rates"];
  constructor(private readonly transport?: OfficialJntTransport) {}
  async getRates(input: ShippingInquiry): Promise<ShippingRate[]> {
    if (!this.transport && !process.env.JNT_API_ENV) throw new HttpError("Integrasi resmi J&T belum diaktifkan di server", 503);
    // L3 provider mapping belongs to the *district*, never a village-level guess.
    // Isolated injected tests retain explicit test fixtures; real Production uses DB release only.
    const mapping = this.transport
      ? getJntAreaMappings().find(m => m.indonesiaCode === input.destination.districtCode)
      : await (async () => {
          const { getVerifiedJntDistrict } = await import("./verified-mapping");
          const row = await getVerifiedJntDistrict(input.destination.districtCode);
          return row.destAreaCode ? { areaCode: row.destAreaCode } : null;
        })();
    if (!mapping) throw new HttpError("Kecamatan belum terpetakan secara resmi ke J&T.", 422);
    const config = this.transport ? null : await (await import("./official-config")).activeJntConfig();
    const originWarehouse = config?.seller?.warehouse.originSite || process.env.JNT_ORIGIN_WAREHOUSE || "";
    if (!originWarehouse) throw new HttpError("Gudang asal J&T belum dikonfigurasi.", 503);
    let rates: ShippingRate[];
    if (this.transport) {
      rates = await this.transport.inquire({ ...input, originWarehouse, destinationArea: mapping.areaCode }, AbortSignal.timeout(6000));
    } else {
      const requested = config!.seller!.services.filter(s => Date.parse(s.validUntil) > Date.now()).map(s => s.code);
      if (!requested.length || new Set(requested).size !== requested.length || requested.some(s => !known.includes(s as typeof known[number]))) {
        throw new HttpError("Layanan J&T belum disetujui operator server.", 503);
      }
      // A tariff response alone does not authorize an AWB service type.
      // Public Create Order contract is proven only for EZ; no checkout of HBO/JND/ECO yet.
      if (requested.some(s => s !== "EZ")) throw new HttpError("Checkout otomatis J&T saat ini hanya mendukung EZ", 503);
      // Load official transport only after carrier mapping/service gates pass.
      // Isolated unit tests with injected adapters must not initialize Prisma or credentials.
      const { checkJntRate } = await import("./official-transport");
      const results = await Promise.all(requested.map(service => checkJntRate({
        originSite: originWarehouse, destinationArea: mapping.areaCode, weightGram: input.weightGram,
        productType: service as typeof known[number],
      })));
      rates = results.flat();
    }
    if (rates.some(r => r.courier !== "J&T Express" || !known.includes(r.service as typeof known[number]) ||
        !Number.isSafeInteger(r.cost) || r.cost < 0)) throw new HttpError("Tarif resmi J&T tidak valid", 502);
    if (new Set(rates.map(r => r.service)).size !== rates.length) throw new HttpError("Tarif resmi J&T duplikat", 502);
    return rates.map(r => ({ ...r, mode: "official" }));
  }
}
