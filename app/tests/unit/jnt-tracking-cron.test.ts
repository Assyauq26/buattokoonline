import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
const testSecret = randomBytes(32).toString("hex");
const expiry = vi.hoisted(() => vi.fn());
vi.mock("@/modules/shipping/jnt-tracking.service", () => ({ syncDailyJntTracking: expiry }));
import { GET } from "@/app/api/internal/cron/jnt-tracking/route";
beforeEach(() => { vi.clearAllMocks(); expiry.mockResolvedValue({updated:1,failed:0,batch:1}); });
afterEach(() => vi.unstubAllEnvs());
describe("tracking cron authentication", () => {
  it("fails closed before querying orders when the secret is absent", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://example.test/api/internal/cron/jnt-tracking"))).status).toBe(503);
    expect(expiry).not.toHaveBeenCalled();
  });
  it.each(["", "Bearer wrong", `Bearer ${"x".repeat(32)}`])("denies an invalid bearer %# before mutations", async authorization => {
    vi.stubEnv("CRON_SECRET", testSecret);
    expect((await GET(new Request("https://example.test/api/internal/cron/jnt-tracking", { headers: { authorization } }))).status).toBe(401);
    expect(expiry).not.toHaveBeenCalled();
  });
  it("uses system eligibility and returns the bounded batch result", async () => {
    vi.stubEnv("CRON_SECRET", testSecret);
    const result = await GET(new Request("https://example.test/api/internal/cron/jnt-tracking", { headers: { authorization: `Bearer ${testSecret}` } }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ success: true, data: { updated: 1, failed: 0, batch: 1 } });
    expect(expiry).toHaveBeenCalledWith();
  });
});
