import type { PaymentProvider } from "@/infrastructure/payments/contracts/payment-provider";

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { openSnap } from "@/modules/payments/midtrans/service";
/** Backend adapter; attempts are persisted by checkout before contacting Snap. */
export class MidtransProvider implements PaymentProvider {
  readonly code = "midtrans";
  readonly capabilities = ["snap", "webhook", "status", "automatic_settlement"];
  async createPayment(input: { orderNumber: string; amount: number }) {
    const payment = await prisma.payment.findFirst({ where: { provider: this.code, order: { orderNumber: input.orderNumber } }, select: { id: true, amount: true } });
    if (!payment || payment.amount !== input.amount) throw new HttpError("Tagihan Midtrans tidak sesuai", 409);
    return { method: "midtrans_snap", amount: payment.amount, reference: input.orderNumber, snap: await openSnap(payment.id) };
  }
}
