import type { PaymentProvider } from "./contracts/payment-provider";
import { ManualTransferProvider } from "./manual/manual-transfer-provider";
import { MidtransProvider } from "./midtrans/midtrans-provider";
import { TripayProvider } from "./tripay/tripay-provider";

const registry: Record<string, PaymentProvider> = {
  manual: new ManualTransferProvider(),
  // Adapters below are prepared but disabled for MVP.
  midtrans: new MidtransProvider(),
  tripay: new TripayProvider(),
};

/** Only `manual` is active in MVP (PAYMENT_PROVIDER env controls future switch). */
export function getPaymentProvider(
  code = process.env.PAYMENT_PROVIDER || "manual",
): PaymentProvider {
  return registry[code] ?? registry.manual;
}

export type { PaymentProvider, PaymentInstruction } from "./contracts/payment-provider";
