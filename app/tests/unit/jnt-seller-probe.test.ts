import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ user: null as any, rate: vi.fn(), tracking: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mock.user }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthBucket: vi.fn() }));
vi.mock("@/infrastructure/shipping/jnt/official-transport", () => ({ checkJntRate: mock.rate, trackJntOrder: mock.tracking }));
vi.mock("@/infrastructure/shipping/jnt/verified-mapping", async (original) => ({
  ...await original<object>(), mappedDestination: async () => ({ destAreaCode: "SYNTHETIC DISTRICT" }),
}));
vi.mock("@/infrastructure/shipping/jnt/official-config", async (original) => ({
  ...await original<object>(), resolveJntDraft: mock.resolve,
}));
import { POST } from "@/app/api/v1/admin/integrations/jnt/test/route";
import { validTariffProof } from "@/infrastructure/shipping/jnt/tariff-proof";
import type { JntConfig } from "@/infrastructure/shipping/jnt/official-config";

const endpoints = Object.fromEntries(["order", "tariff", "tracking", "cancellation"].map(key => [key, "https://synthetic.example"]));
const seller = { warehouse: { districtCode: "31.71.01", name: "Toko Uji", contact: "Toko Uji", phone: "+6281234567890", address: "Alamat sintetis" },
  services: [{ code: "EZ", verificationReference: "synthetic test", validUntil: "2099-01-01T00:00:00Z" }] };
const draft = { environment: "sandbox", endpoints, sharedCancellation: true, credentials: { tariffKey: "SYNTHETIC-DRAFT" }, seller };
const config = { ...draft, seller: { ...seller, warehouse: { ...seller.warehouse, originSite: "SYNTHETIC CITY", originCityCode: "TST" } } } as unknown as JntConfig;

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://store.example");
  vi.stubEnv("JWT_SECRET", "test-only-".repeat(5));
  vi.stubEnv("JNT_API_ENV", "sandbox");
  mock.user = { id: "local-admin", roles: ["Admin"], permissions: ["shipping.update"] };
  mock.resolve.mockResolvedValue({ config, version: "synthetic-mapping", releaseStamp: "synthetic-mapping:1" });
  mock.rate.mockResolvedValue([{ courier: "J&T Express", service: "EZ", cost: 10000 }]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
function request(body: unknown, origin = "https://store.example") {
  return new Request("https://store.example/api/v1/admin/integrations/jnt/test", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const tariff = { draft, endpoint: "tariff", destinationDistrictCode: "31.71.01", weightGram: 1000 };

describe("local seller connection probes", () => {
  it("rejects anonymous, insufficient permissions and cross-origin calls before resolving credentials", async () => {
    const admin = mock.user; mock.user = null;
    expect((await POST(request(tariff))).status).toBe(401);
    mock.user = { ...admin, permissions: [] };
    expect((await POST(request(tariff))).status).toBe(403);
    mock.user = admin;
    expect((await POST(request(tariff, "https://other.example"))).status).toBe(403);
    expect(mock.resolve).not.toHaveBeenCalled();
  });
  it("validates Order and Cancellation without calling either operation", async () => {
    for (const endpoint of ["order", "cancellation"]) {
      const result = await POST(request({ draft, endpoint }));
      expect((await result.json()).data.status).toBe("SAFE_PROBE_UNAVAILABLE");
      expect(result.headers.get("Cache-Control")).toContain("no-store");
    }
    expect(mock.rate).not.toHaveBeenCalled();
    expect(mock.tracking).not.toHaveBeenCalled();
  });
  it("quotes draft before save and binds success to config, environment, warehouse and version", async () => {
    const result = await POST(request(tariff));
    const data = (await result.json()).data;
    expect(result.status).toBe(200);
    expect(data.status).toBe("AUTHENTICATED");
    expect(JSON.stringify(data)).not.toContain("SYNTHETIC-DRAFT");
    expect(mock.resolve).toHaveBeenCalledWith(draft);
    expect(mock.rate).toHaveBeenCalledWith(expect.objectContaining({ originSite: "SYNTHETIC CITY", destinationArea: "SYNTHETIC DISTRICT" }), config);
    expect(validTariffProof(data.tariffProof, config, "sandbox", "synthetic-mapping:1")).toBe(true);
    expect(validTariffProof(data.tariffProof, config, "sandbox", "synthetic-mapping:2")).toBe(false);
    expect(validTariffProof(data.tariffProof, config, "production", "synthetic-mapping:1")).toBe(false);
    expect(validTariffProof(data.tariffProof, config, "sandbox", "other-mapping")).toBe(false);
    const changed = structuredClone(config);
    changed.seller!.warehouse.address = "Changed warehouse";
    expect(validTariffProof(data.tariffProof, changed, "sandbox", "synthetic-mapping:1")).toBe(false);
  });
  it("fails closed on empty, invalid, duplicate and zero rates", async () => {
    for (const rates of [[], [{ courier: "J&T Express", service: "EZ", cost: 0 }],
      [{ courier: "J&T Express", service: "EZ", cost: -1 }], [{ courier: "J&T Express", service: "HBO", cost: 10000 }]]) {
      mock.rate.mockResolvedValueOnce(rates);
      expect((await POST(request(tariff))).status).toBe(502);
    }
  });
  it("requires an authorized seller AWB and nonempty history for a tracking pass", async () => {
    const tracking = { draft, endpoint: "tracking", awb: "SYNTHETICAWB" };
    expect((await POST(request(tracking))).status).toBe(422);
    expect(mock.tracking).not.toHaveBeenCalled();
    mock.tracking.mockResolvedValueOnce({ events: [] });
    expect((await POST(request({ ...tracking, ownsAwb: true }))).status).toBe(502);
    mock.tracking.mockResolvedValueOnce({ events: [{ note: "SENSITIVE-NOTE" }] });
    const result = await POST(request({ ...tracking, ownsAwb: true }));
    expect(result.status).toBe(200);
    expect(await result.text()).not.toContain("SENSITIVE-NOTE");
  });
  it("rejects arbitrary installation IDs, oversized bodies and ungated Production", async () => {
    expect((await POST(request({ ...tariff, installationId: "other" }))).status).toBe(422);
    expect((await POST(request({ padding: "x".repeat(17000) }))).status).toBe(413);
    expect((await POST(request({ ...tariff, draft: { ...draft, environment: "production" } }))).status).toBe(503);
    expect(mock.rate).not.toHaveBeenCalled();
  });
});
