import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/auth/seller-password-reset/route";
import { HttpError } from "@/lib/response";

const mocks = vi.hoisted(() => ({
  after: vi.fn(), limit: vi.fn(), emailLimit: vi.fn(),
  deliver: vi.fn(), verify: vi.fn(), complete: vi.fn(), notify: vi.fn(),
}));
vi.mock("next/server", async importOriginal => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/store-config", () => ({ storeOrigin: () => "https://store.example" }));
vi.mock("@/lib/auth/rate-limit", () => ({ enforceAuthRateLimit: mocks.emailLimit }));
vi.mock("@/modules/auth/registration-otp-email", () => ({ registrationMailConfig: vi.fn() }));
vi.mock("@/modules/auth/seller-password-reset", () => ({
  sellerResetLimit: mocks.limit, deliverSellerReset: mocks.deliver,
  verifySellerReset: mocks.verify, completeSellerReset: mocks.complete, notifySellerReset: mocks.notify,
}));

function submit(body: object, origin = "https://store.example") {
  return POST(new Request("https://store.example/api/v1/auth/seller-password-reset", {
    method: "POST", headers: { origin, "Content-Type": "application/json", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify(body),
  }));
}
beforeEach(() => vi.resetAllMocks());

it("responds generically before looking up an email and budgets IP and email independently", async () => {
  const a = await submit({ action: "request", email: " SELLER@example.com " });
  const b = await submit({ action: "request", email: "unknown@example.com" });
  const first = await a.json(), second = await b.json();
  expect(a.status).toBe(202);
  expect(b.status).toBe(202);
  expect(first.message).toBe(second.message);
  expect(first.id).not.toBe(second.id);
  expect(mocks.deliver).not.toHaveBeenCalled();
  expect(mocks.limit).toHaveBeenCalledWith("request", "ip", "192.0.2.1", 15);
  expect(mocks.emailLimit).toHaveBeenCalledWith("sellerResetRequest", "seller@example.com");
  await mocks.after.mock.calls[0][0]();
  expect(mocks.deliver).toHaveBeenCalledWith("seller@example.com", first.id);
});

it("rejects cross-origin requests and invalid verification codes before service calls", async () => {
  expect((await submit({ action: "request", email: "seller@example.com" }, "https://evil.example")).status).toBe(403);
  expect((await submit({ action: "verify", id: "bad", code: "12345" })).status).toBe(400);
  expect(mocks.limit).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
});

it("rejects invalid grants and mismatched confirmation and schedules notification only on success", async () => {
  const data = { action: "complete", token: "a".repeat(64), password: "satu frasa rahasia", confirmation: "frasa berbeda" };
  expect((await submit(data)).status).toBe(400);
  expect(mocks.complete).not.toHaveBeenCalled();
  data.confirmation = data.password;
  mocks.complete.mockRejectedValueOnce(new HttpError("Izin reset kedaluwarsa atau sudah digunakan. Mulai ulang.", 400));
  expect((await submit(data)).status).toBe(400);
  expect(mocks.after).not.toHaveBeenCalled();
  mocks.complete.mockResolvedValueOnce("seller@example.com");
  expect(await (await submit(data)).json()).toEqual({ ok: true });
  await mocks.after.mock.calls[0][0]();
  expect(mocks.notify).toHaveBeenCalledWith("seller@example.com");
});

it("reports rate limiting without scheduling email", async () => {
  mocks.limit.mockRejectedValue(new HttpError("Terlalu banyak percobaan.", 429));
  expect((await submit({ action: "request", email: "seller@example.com" })).status).toBe(429);
  expect(mocks.after).not.toHaveBeenCalled();
});
