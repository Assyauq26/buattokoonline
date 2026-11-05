import { describe, it, expect } from "vitest";
import { canTransitionPayment } from "@/modules/payments/domain/state-machine";

describe("payment state machine", () => {
  it("moves through verification", () => {
    expect(canTransitionPayment("PENDING_PAYMENT", "WAITING_VERIFICATION")).toBe(true);
    expect(canTransitionPayment("WAITING_VERIFICATION", "PAID")).toBe(true);
    expect(canTransitionPayment("WAITING_VERIFICATION", "REJECTED")).toBe(true);
    expect(canTransitionPayment("REJECTED", "WAITING_VERIFICATION")).toBe(true);
    expect(canTransitionPayment("WAITING_VERIFICATION", "EXPIRED")).toBe(true);
    expect(canTransitionPayment("REJECTED", "EXPIRED")).toBe(true);
  });

  it("does not allow paying from pending directly", () => {
    expect(canTransitionPayment("PENDING_PAYMENT", "PAID")).toBe(false);
  });

  it("keeps PAID terminal", () => {
    expect(canTransitionPayment("PAID", "REJECTED")).toBe(false);
  });
});
