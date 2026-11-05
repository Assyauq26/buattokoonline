import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const cleanup = vi.hoisted(() => vi.fn());
vi.mock("@/modules/catalog/staged-product-media", () => ({ cleanupStagedMedia: cleanup }));
import { GET } from "@/app/api/internal/cron/product-media-cleanup/route";
const secret = "dummy-cleanup-cron-secret-only";
const request = (authorization = `Bearer ${secret}`) => new Request("https://example.test/api/internal/cron/product-media-cleanup", { headers: { authorization } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PRODUCT_MEDIA_CLEANUP_ENABLED", "1");
  vi.stubEnv("CRON_SECRET", secret);
  cleanup.mockResolvedValue({ scanned: 5, cancelled: 2, deleted: 3, failed: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("dormant product media cleanup cron", () => {
  it.each(["", "0"])("does not query media before explicit activation (%s)", async flag => {
    vi.stubEnv("PRODUCT_MEDIA_CLEANUP_ENABLED", flag);
    expect((await GET(request())).status).toBe(503);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it.each(["preview", "development", ""])("refuses non-production environment %s", async value => {
    vi.stubEnv("VERCEL_ENV", value);
    expect((await GET(request())).status).toBe(503);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("fails closed when cron secret is missing or weak", async () => {
    for (const value of ["", "short"]) {
      vi.stubEnv("CRON_SECRET", value);
      expect((await GET(request())).status).toBe(503);
    }
    expect(cleanup).not.toHaveBeenCalled();
  });
  it.each(["", "Bearer wrong", `Bearer ${"x".repeat(secret.length)}`])("rejects wrong bearer before any cleanup %#", async value => {
    expect((await GET(request(value))).status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("returns bounded counts and logs no credential on an approved invocation", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ data: { scanned: 5, cancelled: 2, deleted: 3, failed: 0, maxBatch: 5 } });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[product-media-cleanup]", JSON.stringify({ scanned: 5, cancelled: 2, deleted: 3, failed: 0 }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
  it("signals a partial failure without losing the retry counters or logging provider details", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    cleanup.mockResolvedValue({ scanned: 5, cancelled: 0, deleted: 3, failed: 2 });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, error: { details: { scanned: 5, deleted: 3, failed: 2, maxBatch: 5 } } });
    expect(log).toHaveBeenCalledWith("[product-media-cleanup]", JSON.stringify({ scanned: 5, cancelled: 0, deleted: 3, failed: 2 }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
});
