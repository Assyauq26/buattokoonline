import type { ShippingProvider } from "@/infrastructure/shipping/contracts/shipping-provider";

/** Future KiriminAja adapter boundary. Requires KIRIMINAJA_API_KEY. Not enabled in MVP. */
export class KiriminAjaProvider implements ShippingProvider {
  readonly code = "kiriminaja";
  readonly capabilities = [];
}
