import { it, expect, vi, beforeEach } from "vitest";
import { HttpError } from "@/lib/response";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  create: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/modules/reviews/reviews.service", () => ({
  createReview: mocks.create,
  askQuestion: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
  revalidateTag: mocks.revalidate,
}));
import { createReviewAction } from "@/modules/reviews/reviews.actions";
beforeEach(() => vi.resetAllMocks());
it("requires session authority before invoking the review writer", async () => {
  mocks.user.mockRejectedValue(new HttpError("Login diperlukan", 401));
  const result = await createReviewAction(null, new FormData());
  expect(result.ok).toBe(false);
  expect(result.unauthorized).toBe(true);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("takes product and order destinations from server result, not client fields", async () => {
  mocks.user.mockResolvedValue({ id: "buyer" });
  mocks.create.mockResolvedValue({
    id: "review",
    slug: "real-product",
    orderId: "owned-order",
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    orderItemId: "owned-item",
    rating: "5",
    body: "Sesuai pembelian",
    slug: "forged-product",
    productId: "forged",
    orderId: "other-order",
  }))
    form.set(key, value);
  const result = await createReviewAction(null, form);
  expect(result.ok).toBe(true);
  expect(mocks.create).toHaveBeenCalledWith("buyer", "owned-item", {
    rating: "5",
    title: undefined,
    body: "Sesuai pembelian",
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/orders/owned-order");
  expect(mocks.revalidate).toHaveBeenCalledWith("/product/real-product");
  expect(mocks.revalidate).not.toHaveBeenCalledWith("/product/forged-product");
});
