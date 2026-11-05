import type { PaymentProvider } from "@/infrastructure/payments/contracts/payment-provider";

/**
 * Future provider boundary. Not activated in MVP.
 * Requires MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY before enabling.
 */
export class MidtransProvider implements PaymentProvider {
  readonly code = "midtrans";
  readonly capabilities = [];
  async createPayment(): Promise<never> {
    throw new Error("MidtransProvider is not enabled in MVP");
  }
}
