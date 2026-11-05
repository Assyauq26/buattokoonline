/** Provider-agnostic payment contract. Core domain depends on this, never on a vendor SDK. */
export interface PaymentInstruction {
  method: string;
  bank?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    displayName: string;
  } | null;
  amount: number;
  reference: string;
  expiresAt?: Date | null;
}

export interface PaymentProvider {
  readonly code: string;
  readonly capabilities: string[];
  createPayment(input: {
    orderNumber: string;
    amount: number;
    bankAccount?: PaymentInstruction["bank"];
    expiresAt?: Date | null;
  }): Promise<PaymentInstruction>;
  handleWebhook?(payload: unknown, signature?: string): Promise<void>;
}
