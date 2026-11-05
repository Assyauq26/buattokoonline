import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/auth/session", () => auth);
import { canReadApplicationUpdates } from "@/modules/application-updates/access";
const repo = "Assyauq26/buattokoonline", sha = "a".repeat(40);
const admin = { isAdmin: true, roles: ["Admin"], permissions: ["audit.read"] };
function release(version = "1.0.1") {
  return { draft: false, prerelease: false, tag_name: "v" + version, html_url: `https://github.com/${repo}/releases/tag/v${version}`, published_at: "2026-11-05T03:35:14Z", body: "<script>alert('literal text')</script>", assets: [{ name: `store-v${version}.tar.gz`, digest: "sha256:" + "b".repeat(64), size: 1000, browser_download_url: `https://github.com/${repo}/releases/download/v${version}/store-v${version}.tar.gz` }] };
}
function github(latest: ReturnType<typeof release> | null = release()) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/releases/latest")) return latest ? Response.json(latest) : new Response(null, { status: 404 });
    if (url.includes("/git/ref/")) return Response.json({ object: { type: "commit", sha } });
    return Response.json({ id: 1446326256, full_name: repo });
  });
}
beforeEach(() => { vi.resetModules(); vi.stubGlobal("fetch", github()); process.env.APP_ORIGIN = "https://localhost"; auth.requirePermission.mockResolvedValue(admin); });
afterEach(() => vi.unstubAllGlobals());

describe("read-only application updates", () => {
  it("shows installed version from this running application and same official release as current", async () => {
    const service = await import("@/modules/application-updates/service");
    expect(service.readUpdateStatus().installedVersion).toBe("1.0.1");
    const result = await service.checkForUpdates();
    expect(result.status).toBe("current"); expect(result.checking).toBe(false); expect(result.release?.sha).toBe(sha);
    expect(result.compatibility).toBe("pending_cli"); expect(result.execution).toBe("cli");
  });
  it.each([["1.0.0", "ahead"], ["1.0.2", "available"]])("compares official %s without inventing a release", async (version, status) => {
    vi.stubGlobal("fetch", github(release(version)));
    expect((await (await import("@/modules/application-updates/service")).checkForUpdates()).status).toBe(status);
  });
  it("reports a genuinely absent stable release", async () => {
    vi.stubGlobal("fetch", github(null));
    const result = await (await import("@/modules/application-updates/service")).checkForUpdates();
    expect(result.status).toBe("no_release"); expect(result.release).toBeNull();
  });
  it.each(["draft", "prerelease", "wrong repository", "missing digest", "evil download", "invalid version", "invalid commit"])("rejects %s", async kind => {
    const data = release();
    if (kind === "draft") data.draft = true;
    if (kind === "prerelease") data.prerelease = true;
    if (kind === "missing digest") data.assets[0].digest = "";
    if (kind === "evil download") data.assets[0].browser_download_url = "https://attacker.example/package";
    if (kind === "invalid version") data.tag_name = "v1.0.2;id";
    const fetcher = github(data);
    vi.stubGlobal("fetch", async (url: string) => kind === "wrong repository" && url.endsWith(repo) ? Response.json({ id: 1, full_name: repo }) : kind === "invalid commit" && url.includes("/git/ref/") ? Response.json({ object: { type: "commit", sha: "invalid" } }) : fetcher(url));
    await expect((await import("@/modules/application-updates/service")).checkForUpdates()).rejects.toMatchObject({ status: 502 });
  });
  it("rejects overlapping checks and enforces a cooldown after completion", async () => {
    let unblock!: () => void;
    const pending = new Promise<void>(resolve => { unblock = resolve; }); const fetcher = github();
    vi.stubGlobal("fetch", async (url: string) => { await pending; return fetcher(url); });
    const service = await import("@/modules/application-updates/service"); const first = service.checkForUpdates();
    await expect(service.checkForUpdates()).rejects.toMatchObject({ status: 409 }); unblock(); await first;
    await expect(service.checkForUpdates()).rejects.toMatchObject({ status: 429 });
  });
  it("fails closed on network errors and oversized metadata without disclosing secrets", async () => {
    vi.stubGlobal("fetch", async () => { throw Error("private token in internal error"); });
    const service = await import("@/modules/application-updates/service");
    await expect(service.checkForUpdates()).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining("private token") });
    vi.resetModules(); vi.stubGlobal("fetch", async () => new Response("x".repeat(1024 * 1024 + 1)));
    await expect((await import("@/modules/application-updates/service")).checkForUpdates()).rejects.toMatchObject({ status: 502 });
  });
  it("restricts inspection to Admin with audit permission, including protection against a customer granted that permission", () => {
    expect(canReadApplicationUpdates(admin)).toBe(true);
    for (const actor of [null, { ...admin, roles: ["Customer"] }, { ...admin, roles: ["Manager"] }, { ...admin, permissions: [] }, { ...admin, isAdmin: false }]) expect(canReadApplicationUpdates(actor)).toBe(false);
  });
  it("requires session authorization, same-origin CSRF protection and exactly an empty JSON object", async () => {
    const route = await import("@/app/api/v1/admin/application-updates/route");
    const { HttpError } = await import("@/lib/response");
    auth.requirePermission.mockRejectedValueOnce(new HttpError("Unauthorized", 401)); expect((await route.GET()).status).toBe(401);
    auth.requirePermission.mockResolvedValueOnce({ ...admin, roles: ["Customer"] }); expect((await route.GET()).status).toBe(403);
    for (const [origin, body, code] of [["https://attacker.example", "{}", 403], [null, "{}", 403], ["https://localhost", '{"command":"id"}', 422], ["https://localhost", '{"url":"http://169.254.169.254"}', 422], ["https://localhost", "x".repeat(65), 413], ["https://localhost", "[]", 422]] as const) {
      const headers: Record<string, string> = { "content-type": "application/json" }; if (origin) headers.Origin = origin;
      expect((await route.POST(new Request("https://localhost/api/v1/admin/application-updates", { method: "POST", headers, body }))).status).toBe(code);
    }
    const response = await route.POST(new Request("https://localhost/api/v1/admin/application-updates", { method: "POST", headers: { Origin: "https://localhost", "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
