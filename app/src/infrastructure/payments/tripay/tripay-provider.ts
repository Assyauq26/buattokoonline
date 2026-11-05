import type { PaymentProvider } from "@/infrastructure/payments/contracts/payment-provider";

/**
 * Future provider boundary. Not activated in MVP.
 * Requires TRIPAY_API_KEY / TRIPAY_PRIVATE_KEY before enabling.
 */
export class TripayProvider implements PaymentProvider {
  readonly code = "tripay";
  readonly capabilities = [];
  async createPayment(): Promise<never> {
    throw new Error("TripayProvider is not enabled in MVP");
  }
}
