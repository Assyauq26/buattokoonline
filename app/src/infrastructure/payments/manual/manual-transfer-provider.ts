import type {
  PaymentInstruction,
  PaymentProvider,
} from "@/infrastructure/payments/contracts/payment-provider";

/** MVP payment provider: customer transfers manually and uploads proof. */
export class ManualTransferProvider implements PaymentProvider {
  readonly code = "manual";
  readonly capabilities = ["createPayment", "confirmTransfer"];

  async createPayment(input: {
    orderNumber: string;
    amount: number;
    bankAccount?: PaymentInstruction["bank"];
    expiresAt?: Date | null;
  }): Promise<PaymentInstruction> {
    return {
      method: "bank_transfer",
      bank: input.bankAccount ?? null,
      amount: input.amount,
      reference: input.orderNumber,
      expiresAt: input.expiresAt ?? null,
    };
  }
}
