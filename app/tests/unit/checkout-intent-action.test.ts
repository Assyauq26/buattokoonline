import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/response";
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set }) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserBasic: mocks.user }));
vi.mock("@/modules/checkout/checkout-intent", () => ({ CHECKOUT_INTENT_COOKIE: "gh_buy_now", CHECKOUT_INTENT_TTL_SECONDS: 900, createCheckoutIntent: mocks.create }));
import { buyNowAction } from "@/modules/checkout/checkout-intent.actions";
const id = "0d1b15fb-c5b8-4246-b2d5-a9fae6ce121d";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(null);
  mocks.get.mockReturnValue(undefined);
  mocks.create.mockResolvedValue({ id, secret: "dummy-browser-secret", expiresAt: new Date() });
});
afterEach(() => vi.unstubAllEnvs());
describe("Buy Now action boundary", () => {
  it("binds guests to a secure HttpOnly cookie and returns only a local login continuation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await buyNowAction("selected-variant", 2);
    expect(mocks.create).toHaveBeenCalledWith(null, { variantId: "selected-variant", quantity: 2 }, undefined);
    expect(mocks.set).toHaveBeenCalledWith("gh_buy_now", "dummy-browser-secret", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900 });
    expect(response).toEqual({ ok: true, data: { checkoutUrl: `/login?redirectTo=${encodeURIComponent(`/checkout?intent=${id}`)}` } });
    expect(JSON.stringify(response)).not.toContain("dummy-browser-secret");
  });
  it("binds authenticated intents to the server identity and never exposes a browser secret", async () => {
    mocks.user.mockResolvedValue({ id: "authenticated-user" });
    const response = await buyNowAction("sku", 1);
    expect(mocks.create).toHaveBeenCalledWith("authenticated-user", { variantId: "sku", quantity: 1 }, undefined);
    expect(response.data?.checkoutUrl).toBe(`/checkout?intent=${id}`);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it.each([409, 422, 429, 503])("a rejected intent (%s) never produces a usable URL or new cookie", async status => {
    mocks.create.mockRejectedValueOnce(new HttpError("Checkout ditolak", status));
    const response = await buyNowAction("sku", 1);
    expect(response.ok).toBe(false);
    expect(response.data).toBeUndefined();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("session validation failure prevents even requesting an intent", async () => {
    mocks.user.mockRejectedValueOnce(new HttpError("Autentikasi tidak tersedia", 503));
    expect((await buyNowAction("sku", 1)).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
