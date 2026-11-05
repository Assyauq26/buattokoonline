import { describe, expect, it } from "vitest";
import { canExpireOrder } from "@/modules/orders/expiry-policy";

const past = new Date("2026-01-01T00:00:00Z");
const future = new Date("2028-01-01T00:00:00Z");
const now = new Date("2027-01-01T00:00:00Z");
const candidate = { status: "PENDING_PAYMENT", expiresAt: past, paymentStatus: "PENDING_PAYMENT", payment: { status: "PENDING_PAYMENT" } };

describe("safe order expiry policy", () => {
  it("expires only overdue pending-payment orders", () => {
    expect(canExpireOrder(candidate, now)).toBe(true);
    expect(canExpireOrder({ ...candidate, expiresAt: future }, now)).toBe(false);
    expect(canExpireOrder({ ...candidate, status: "PAID" }, now)).toBe(false);
    expect(canExpireOrder({ ...candidate, payment: null }, now)).toBe(false);
  });
  it("preserves reserved stock while proof is under financial review", () => {
    expect(canExpireOrder({ ...candidate, payment: { status: "WAITING_VERIFICATION" }, paymentStatus: "WAITING_VERIFICATION" }, now)).toBe(false);
    expect(canExpireOrder({ ...candidate, payment: { status: "PAID" } }, now)).toBe(false);
    expect(canExpireOrder({ ...candidate, paymentStatus: "PAID" }, now)).toBe(false);
  });
  it("allows overdue rejected proofs to be closed once no review is active", () => {
    expect(canExpireOrder({ ...candidate, payment: { status: "REJECTED" }, paymentStatus: "REJECTED" }, now)).toBe(true);
  });
});
