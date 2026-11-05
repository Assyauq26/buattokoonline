import { describe, it, expect } from "vitest";
import { refundRequestSchema, refundVerificationSchema, refundReturnSchema } from "@/modules/payments/refund.validation";
import { manualShipmentSchema, canTransitionShipment } from "@/modules/shipping/shipment.validation";
import { canTransitionPayment } from "@/modules/payments/domain/state-machine";
const requestId = "11111111-1111-4111-8111-111111111111";
describe("refund and shipment backend policy", () => {
  it("accepts bounded full-refund intent and rejects malformed money/key/reason", () => {
    expect(refundRequestSchema.safeParse({ requestId, amount: 120000, reason: "Full refund" }).success).toBe(true);
    for (const amount of [0, -1, 1.5, 2_147_483_648]) expect(refundRequestSchema.safeParse({ requestId, amount, reason: "Full refund" }).success).toBe(false);
    expect(refundRequestSchema.safeParse({ requestId: "bad", amount: 1, reason: "" }).success).toBe(false);
  });
  it("requires manual-review attestation and evidence and normalizes reference", () => {
    const value = { amount: 120000, sourceAccountId: "account", evidenceReference: "bank-ref-123", settledAt: new Date(), verificationKind: "MANUAL_BANK_REVIEW", attested: true };
    expect(refundVerificationSchema.parse(value).evidenceReference).toBe("BANK-REF-123");
    expect(refundVerificationSchema.safeParse({ ...value, attested: false }).success).toBe(false);
    expect(refundVerificationSchema.safeParse({ ...value, evidenceReference: "" }).success).toBe(false);
    expect(refundVerificationSchema.safeParse({ ...value, verificationKind: "PROVIDER_SUCCESS" }).success).toBe(false);
  });
  it("rejects future settlement timestamps", () => {
    expect(refundVerificationSchema.safeParse({ amount: 120000, sourceAccountId: "account", evidenceReference: "bank-ref-123", settledAt: new Date(Date.now() + 60000), verificationKind: "MANUAL_BANK_REVIEW", attested: true }).success).toBe(false);
  });
  it("requires explicit physical receipt, unique items and positive quantities", () => {
    const value = { requestId, receivedAt: new Date(), receiptReference: "RECEIPT", reason: "Physical receipt", physicalReturnVerified: true, items: [{ orderItemId: "item", quantity: 1 }] };
    expect(refundReturnSchema.safeParse(value).success).toBe(true);
    expect(refundReturnSchema.safeParse({ ...value, physicalReturnVerified: false }).success).toBe(false);
    expect(refundReturnSchema.safeParse({ ...value, items: [...value.items, ...value.items] }).success).toBe(false);
    expect(refundReturnSchema.safeParse({ ...value, items: [{ orderItemId: "item", quantity: 0 }] }).success).toBe(false);
  });
  it("allows shipment progress and rejects regression or direct creation as delivered", () => {
    expect(canTransitionShipment(null, "SHIPPED")).toBe(true);
    expect(canTransitionShipment(null, "DELIVERED")).toBe(false);
    expect(canTransitionShipment("SHIPPED", "IN_TRANSIT")).toBe(true);
    expect(canTransitionShipment("IN_TRANSIT", "DELIVERED")).toBe(true);
    expect(canTransitionShipment("DELIVERED", "SHIPPED")).toBe(false);
  });
  it("rejects invalid shipment dates and cost", () => {
    const value = { courier: "Test", service: "REG", cost: 20000, status: "PENDING" };
    expect(manualShipmentSchema.safeParse(value).success).toBe(true);
    expect(manualShipmentSchema.safeParse({ ...value, cost: -1 }).success).toBe(false);
    expect(manualShipmentSchema.safeParse({ ...value, shippedDate: new Date("bad") }).success).toBe(false);
  });
  it("keeps refunded payments terminal and requires dedicated transition from paid", () => {
    expect(canTransitionPayment("PAID", "REFUNDED")).toBe(true);
    expect(canTransitionPayment("REFUNDED", "PAID")).toBe(false);
    expect(canTransitionPayment("REFUNDED", "WAITING_VERIFICATION")).toBe(false);
  });
});
