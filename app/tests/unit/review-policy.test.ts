import { describe, it, expect } from "vitest";
import {
  eligibleReviewOrder,
  reviewInput,
  reviewDisplayName,
} from "@/modules/reviews/review-policy";
describe("verified review policy", () => {
  it("requires received order and both paid authorities", () => {
    for (const status of ["DELIVERED", "COMPLETED"])
      expect(
        eligibleReviewOrder({
          status,
          paymentStatus: "PAID",
          payment: { status: "PAID" },
        }),
      ).toBe(true);
    for (const status of [
      "PENDING_PAYMENT",
      "SHIPPED",
      "CANCELLED",
      "EXPIRED",
      "REFUNDED",
    ])
      expect(
        eligibleReviewOrder({
          status,
          paymentStatus: "PAID",
          payment: { status: "PAID" },
        }),
      ).toBe(false);
    expect(
      eligibleReviewOrder({
        status: "DELIVERED",
        paymentStatus: "PAID",
        payment: null,
      }),
    ).toBe(false);
    expect(
      eligibleReviewOrder({
        status: "DELIVERED",
        paymentStatus: "REJECTED",
        payment: { status: "PAID" },
      }),
    ).toBe(false);
  });
  it("does not expose a surname, email or phone as display identity", () => {
    expect(reviewDisplayName("Ayu Private Surname")).toBe("Ayu");
    expect(reviewDisplayName("buyer@example.test")).toBe("Pembeli");
    expect(reviewDisplayName("0812345678")).toBe("Pembeli");
  });
  it("validates trimmed bounds and rejects client identity fields", () => {
    expect(reviewInput.safeParse({ rating: 5, body: "  baik  " }).success).toBe(
      true,
    );
    for (const input of [
      { rating: true, body: "baik" },
      { rating: 1.5, body: "baik" },
      { rating: 0, body: "baik" },
      { rating: 5, body: " " },
      { rating: 5, body: "baik", productId: "forged" },
      { rating: 5, body: "x".repeat(2001) },
    ])
      expect(reviewInput.safeParse(input).success).toBe(false);
  });
});
