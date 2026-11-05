import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const s = vi.hoisted(() => ({ user: null as any, audit: vi.fn(), rate: vi.fn(), state: null as any }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => s.user }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthBucket: vi.fn() }));
vi.mock("@/modules/audit/audit.service", () => ({ writeAudit: (...args: any[]) => s.audit(...args) }));
vi.mock("@/infrastructure/shipping/jnt/official-transport", () => ({ checkJntRate: (...args: any[]) => s.rate(...args) }));
vi.mock("@/infrastructure/shipping/jnt/verified-mapping", () => ({ getVerifiedJntDistrict: async () => ({ destinationArea: "SYNTHETIC DISTRICT" }) }));
vi.mock("@/infrastructure/shipping/jnt/official-config", async () => {
  const { z } = await import("zod");
  const { mayManageLocalJnt } = await import("@/infrastructure/shipping/jnt/seller-config");
  return { isJntSettingsAdministrator: mayManageLocalJnt, readJntSettings: async () => s.state, jntEnvironment: z.enum(["sandbox", "production"]) };
});
import { POST } from "@/app/api/v1/admin/integrations/jnt/test/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); s.user = null; s.state = null; });
function setup() {
  vi.stubEnv("APP_ORIGIN", "https://store.example");
  s.user = { id: "local-admin", roles: ["Admin"], permissions: ["shipping.update"] };
  s.state = { enabled: true, config: { seller: { warehouse: { originSite: "SYNTHETIC CITY" },
    services: [{ code: "EZ", validUntil: "2030-01-01T00:00:00Z" }] }, credentials: { orderKey: "NEVER-RETURN-THIS-KEY" } } };
  s.rate.mockResolvedValue([{ courier: "J&T Express", service: "EZ", cost: 10000 }]);
}
function request(body: unknown, origin = "https://store.example") {
  return new Request("https://store.example/api/v1/admin/integrations/jnt/test", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
describe("local seller connection probes", () => {
  it("denies anonymous, unprivileged and cross-origin calls before touching carrier", async () => {
    setup(); const admin = s.user; s.user = null;
    expect((await POST(request({}))).status).toBe(401);
    s.user = { ...admin, roles: ["Customer"] };
    expect((await POST(request({}))).status).toBe(403);
    s.user = admin;
    expect((await POST(request({}, "https://attacker.example"))).status).toBe(403);
    expect(s.rate).not.toHaveBeenCalled();
  });
  it("rejects staff without shipping permission before carrier activity", async () => {
    setup();
    s.user.permissions = [];
    expect((await POST(request({ environment: "sandbox", endpoint: "tariff" }))).status).toBe(403);
    expect(s.rate).not.toHaveBeenCalled();
  });

  it("does not invent safe Order/Cancel/Tracking probes or dispatch any request", async () => {
    setup();
    for (const endpoint of ["order", "cancellation", "tracking"]) {
      const result = await POST(request({ environment: "sandbox", endpoint }));
      expect((await result.json()).data.status).toBe("SAFE_PROBE_UNAVAILABLE");
      expect(result.headers.get("Cache-Control")).toContain("no-store");
    }
    expect(s.rate).not.toHaveBeenCalled(); expect(s.audit).toHaveBeenCalledTimes(3);
  });
  it("uses only saved local config and approved mapping for read-only Check Fee, never returns secrets", async () => {
    setup();
    const result = await POST(request({ environment: "sandbox", endpoint: "tariff", destinationDistrictCode: "31.71.01", weightGram: 1000 }));
    const text = await result.text(); expect(result.status).toBe(200); expect(text).toContain("CONNECTED"); expect(text).not.toContain("NEVER-RETURN");
    expect(s.rate).toHaveBeenCalledWith(expect.objectContaining({ originSite: "SYNTHETIC CITY", destinationArea: "SYNTHETIC DISTRICT" }), s.state.config);
  });
  it("does not report CONNECTED on empty, mismatched or invalid Check Fee results", async () => {
    setup();
    const req = () => request({ environment: "sandbox", endpoint: "tariff", destinationDistrictCode: "31.71.01", weightGram: 1000 });
    for (const result of [
      [],
      [{ courier: "J&T Express", service: "HBO", cost: 10000 }],
      [{ courier: "J&T Express", service: "EZ", cost: -1 }],
      [{ courier: "J&T Express", service: "EZ", cost: 10000 }, { courier: "J&T Express", service: "EZ", cost: 12000 }],
    ]) {
      s.rate.mockResolvedValueOnce(result);
      const response = await POST(req());
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("CONNECTED");
    }
    expect(s.audit).not.toHaveBeenCalled();
  });

  it("rejects ID/credential injection and Production calls without server approval", async () => {
    setup();
    expect((await POST(request({ environment: "sandbox", endpoint: "tariff", installationId: "other-install" }))).status).toBe(422);
    expect((await POST(request({ environment: "production", endpoint: "tariff", destinationDistrictCode: "31.71.01", weightGram: 1000 }))).status).toBe(503);
    expect(s.rate).not.toHaveBeenCalled();
  });
  it("bounds bodies without trusting Content-Length and never echoes malformed secret input", async () => {
    setup();
    const tooLarge = await POST(request({ padding: "x".repeat(5000) }));
    expect(tooLarge.status).toBe(413);
    const invalid = new Request("https://store.example/api/v1/admin/integrations/jnt/test", { method: "POST", headers: { Origin: "https://store.example" }, body: "{NEVER-ECHO-SYNTHETIC-SECRET" });
    const result = await POST(invalid); expect(result.status).toBe(422); expect(await result.text()).not.toContain("NEVER-ECHO");
    expect(s.rate).not.toHaveBeenCalled();
  });
});
