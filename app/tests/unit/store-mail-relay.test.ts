import { afterEach, expect, it, vi } from "vitest";
import { registrationMailConfig, sendStoreMail, storeMailStatus } from "@/modules/auth/registration-otp-email";
import { OTP_ADDRESS, sanitizeMailBrand } from "@/modules/auth/mail-contract.mjs";
import { hashRelayValue, parseRegistry, relayMail } from "../../../services/mail-relay/relay.mjs";

vi.mock("@/modules/appearance/service", () => ({
  readPublishedUncached: async () => ({ config: { identity: { name: "Gheverhan" } } }),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const origin = "https://shop.example.test", token = "a".repeat(64);
const seller = "seller@example.test", buyer = "buyer@example.test";
const stores = parseRegistry([
  { origin, brand: "Gheverhan", tokenHash: hashRelayValue(token), sellerEmails: [seller] },
  { origin: "https://other.example.test", brand: "Toko Lain", tokenHash: hashRelayValue("b".repeat(64)), sellerEmails: ["other@example.test"] },
]);
const payload = { origin, brand: "Gheverhan", purpose: "customer-registration", value: "012345", to: buyer };

it("reports exhausted Beta capacity without claiming delivery", async () => {
  vi.stubEnv("STORE_MAIL_RELAY_TOKEN", token);
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
  await expect(sendStoreMail("customer-registration", buyer, "012345")).rejects.toMatchObject({ status: 429 });
  await expect(sendStoreMail("customer-registration", buyer, "012345")).rejects.toThrow("Email belum dikirim");
});

it("uses persisted branding for customer mail and only sends the store token to the fixed relay", async () => {
  vi.stubEnv("STORE_MAIL_RELAY_TOKEN", token);
  vi.stubEnv("RESEND_API_KEY", "platform-key-must-not-be-sent");
  vi.stubEnv("APP_ORIGIN", origin);
  const mock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", mock);
  await sendStoreMail("customer-registration", buyer, "012345");
  const [url, request] = mock.mock.calls[0];
  expect(url).toBe("https://buattokosendiri.web.id/api/platform/store-mail");
  expect(request.headers.Authorization).toBe("Bearer " + token);
  expect(request.redirect).toBe("error");
  expect(JSON.parse(request.body)).toEqual({ ...payload, requestId: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  expect(await storeMailStatus()).toEqual({ configured: true, state: "active", brand: "Gheverhan", sender: `Gheverhan <${OTP_ADDRESS}>` });
});

it("rejects an ambient Resend key unless the operator opts into trusted direct mode", () => {
  vi.stubEnv("STORE_MAIL_RELAY_TOKEN", "");
  vi.stubEnv("RESEND_API_KEY", "isolated-unit-key");
  vi.stubEnv("STORE_MAIL_MODE", "");
  expect(() => registrationMailConfig()).toThrow();
  vi.stubEnv("STORE_MAIL_MODE", "operator-direct");
  expect(registrationMailConfig().mode).toBe("direct");
});

it("rejects cross-store identities, arbitrary headers, revoked tokens and seller recipients", async () => {
  const deliver = vi.fn(), reserve = vi.fn(() => true);
  const run = (body: object, credential = token) => relayMail({
    authorization: "Bearer " + credential, payload: body,
  }, { stores, reserve, deliver });
  expect(await run(payload, "c".repeat(64))).toBe(401);
  expect(await run({ ...payload, origin: "https://other.example.test" })).toBe(403);
  expect(await run({ ...payload, brand: "Toko Lain" })).toBe(409);
  expect(await run({ ...payload, from: "forged@example.test" })).toBe(400);
  expect(await run({ ...payload, purpose: "seller-reset", to: buyer })).toBe(403);
  expect(await run({ ...payload, purpose: "customer-test", to: buyer, value: "" })).toBe(403);
  expect(deliver).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});

it("renders fixed, purpose-specific messages and a reset URL bound to the authorized store", async () => {
  const deliver = vi.fn();
  const run = (body: object) => relayMail({ authorization: "Bearer " + token, payload: body }, {
    stores, reserve: () => true, deliver,
  });
  expect(await run(payload)).toBe(202);
  expect(await run({ ...payload, purpose: "seller-reset", to: seller })).toBe(202);
  expect(await run({ ...payload, purpose: "customer-reset", value: "f".repeat(64) })).toBe(202);
  expect(await run({ ...payload, purpose: "customer-test", to: seller, value: "" })).toBe(202);
  expect(deliver.mock.calls.map(([mail]) => mail.from)).toEqual([
    `Gheverhan <${OTP_ADDRESS}>`, `Buattokosendiri <${OTP_ADDRESS}>`, `Gheverhan <${OTP_ADDRESS}>`, `Gheverhan <${OTP_ADDRESS}>`,
  ]);
  expect(deliver.mock.calls[2][0].text).toContain(origin + "/reset-password?token=");
  expect(deliver.mock.calls[0][0].html).toContain("012345");
  expect(sanitizeMailBrand("Gheverhan\r\nBcc: <attacker@example.test>")).not.toMatch(/[\r\n<>:@]/);
});

it("fails closed on quota exhaustion and provider rejection", async () => {
  const deliver = vi.fn().mockRejectedValue(new Error("provider refused"));
  const request = { authorization: "Bearer " + token, payload };
  expect(await relayMail(request, { stores, reserve: () => false, deliver })).toBe(429);
  expect(deliver).not.toHaveBeenCalled();
  expect(await relayMail(request, { stores, reserve: () => true, deliver })).toBe(503);
});
