import type { PaymentProvider } from "./contracts/payment-provider";
import { ManualTransferProvider } from "./manual/manual-transfer-provider";
import { MidtransProvider } from "./midtrans/midtrans-provider";
import { TripayProvider } from "./tripay/tripay-provider";

const registry: Record<string, PaymentProvider> = {
  manual: new ManualTransferProvider(),
  // Midtrans is configured per installation; manual remains an explicit choice.
  midtrans: new MidtransProvider(),
  tripay: new TripayProvider(),
};

/** A selected provider must never silently become a manual transfer. */
export function getPaymentProvider(
  code = process.env.PAYMENT_PROVIDER || "manual",
): PaymentProvider {
  if (!registry[code]) throw new Error("Provider pembayaran tidak dikenal");
  return registry[code];
}

export type { PaymentProvider, PaymentInstruction } from "./contracts/payment-provider";
