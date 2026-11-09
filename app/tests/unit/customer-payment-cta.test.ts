import { it, expect } from "vitest";
import { customerCanPay, customerOrderGroup } from "@/lib/customer-order-view";
it("only accepts unpaid valid orders or an explicit proof correction", () => {
  const o = {
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING_PAYMENT",
    expiresAt: new Date(Date.now() + 10000),
    payment: { status: "PENDING_PAYMENT" },
  };
  expect(customerCanPay(o)).toBe(true);
  for (const status of ["PAID", "CANCELLED", "COMPLETED", "EXPIRED"])
    expect(customerCanPay({ ...o, status })).toBe(false);
  expect(customerCanPay({ ...o, expiresAt: new Date(0) })).toBe(false);
  expect(
    customerCanPay({
      ...o,
      paymentStatus: "WAITING_VERIFICATION",
      payment: { status: "WAITING_VERIFICATION" },
    }),
  ).toBe(false);
  expect(
    customerCanPay({
      ...o,
      paymentStatus: "REJECTED",
      payment: { status: "REJECTED" },
      expiresAt: new Date(0),
    }),
  ).toBe(true);
  expect(
    customerOrderGroup({ status: "CANCELLED", paymentStatus: "PAID" }),
  ).toBe("cancelled");
});
