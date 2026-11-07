import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/response";
import { POST } from "@/app/api/v1/admin/email-otp/test/route";

const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/store-config", () => ({ storeOrigin: () => "https://shop.example.test" }));
vi.mock("@/lib/auth/session", () => ({ requirePermission: m.auth }));
vi.mock("@/lib/auth/rate-limit", () => ({ enforceAuthRateLimit: m.limit }));
vi.mock("@/modules/auth/registration-otp-email", () => ({ sendStoreMail: m.send }));

const origin = "https://shop.example.test";
const post = (source = origin) => POST(new Request(origin + "/api/v1/admin/email-otp/test", {
  method: "POST", headers: { origin: source, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "untrusted@example.test", brand: "Untrusted sender" }),
}));

beforeEach(() => vi.resetAllMocks());

it("rejects cross-origin and unauthorized delivery", async () => {
  expect((await post("https://untrusted.example.test")).status).toBe(403);
  expect(m.auth).not.toHaveBeenCalled();
  m.auth.mockRejectedValueOnce(new HttpError("Tidak berwenang", 401));
  expect((await post()).status).toBe(401);
  expect(m.send).not.toHaveBeenCalled();
});

it("authorizes a store publisher and sends only to the session email", async () => {
  m.auth.mockResolvedValue({ id: "operator", email: "owner@example.test" });
  expect((await post()).status).toBe(200);
  expect(m.auth).toHaveBeenCalledWith("store.customize.publish");
  expect(m.limit).toHaveBeenCalledWith("mailTest", "operator");
  expect(m.send).toHaveBeenCalledWith("customer-test", "owner@example.test", "");
});
