import type {
  ShippingProvider,
  ShippingRate,
  ShippingInquiry,
} from "@/infrastructure/shipping/contracts/shipping-provider";
import { getManualJntConfig } from "../jnt/jnt-config";
import { validateLocation } from "@/modules/regions/region.service";

/** MVP shipping: admin enters courier, service, cost and resi manually. */
export class ManualShippingProvider implements ShippingProvider {
  readonly code = "manual";
  readonly capabilities = ["manualEntry"];

  async getRates(input: ShippingInquiry): Promise<ShippingRate[]> {
    const config = getManualJntConfig();
    if (!config) return [];
    await validateLocation(config.origin);
    const matching = config.rates.filter(r => r.destinationVillageCode === input.destination.villageCode &&
      input.weightGram >= r.minWeightGram && input.weightGram <= r.maxWeightGram && new Date(r.validUntil).getTime() > Date.now());
    // Ambiguous overlapping admin rules fail closed instead of picking a cheaper tariff.
    if (new Set(matching.map(r => r.service)).size !== matching.length) throw new Error("Tarif manual J&T tumpang tindih");
    return matching.map(r => ({ courier: "J&T Express", service: r.service, cost: r.cost, etd: r.etd, mode: "manual", reference: r.reference, validUntil: r.validUntil }));
  }
}
