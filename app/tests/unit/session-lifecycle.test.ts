import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  audit: vi.fn(), findUnique: vi.fn(), revoke: vi.fn(), set: vi.fn(), sign: vi.fn(),
  claims: { sub: "fixture", email: "fixture@example.test", version: 0, tokenHash: "fixture-hash", expiresAt: new Date("2099-01-01") },
}));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-session" }), set: mocks.set }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth/jwt", () => ({ verifySessionClaims: async () => mocks.claims, signSession: mocks.sign }));
vi.mock("@/lib/auth/session-state", () => ({ activeSessionWhere: vi.fn(), assertSessionRevocationAccess: vi.fn(), revokeSession: mocks.revoke }));
vi.mock("@/modules/audit/audit.service", () => ({ writeAudit: mocks.audit }));
import { createSession, destroySession } from "@/lib/auth/session";
beforeEach(() => { vi.clearAllMocks(); mocks.audit.mockResolvedValue(undefined); mocks.revoke.mockResolvedValue(undefined); mocks.findUnique.mockResolvedValue({ sessionVersion: 2 }); mocks.sign.mockResolvedValue("synthetic-new-session"); });
describe("session lifecycle", () => {
  it("revokes the verified captured session before completing logout", async () => {
    await destroySession();
    expect(mocks.revoke).toHaveBeenCalledWith(mocks.claims);
    expect(mocks.set).toHaveBeenCalledWith("store_session", "", expect.objectContaining({ httpOnly: true, secure: true, maxAge: 0 }));
  });
  it("clears the cookie but reports failure when durable revocation fails", async () => {
    mocks.revoke.mockRejectedValue(new Error("database unavailable"));
    await expect(destroySession()).rejects.toThrow("database unavailable");
    expect(mocks.set).toHaveBeenCalledOnce();
  });
  it("binds session creation to the version authenticated before a concurrent reset", async () => {
    await createSession("fixture", "fixture@example.test", 2);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "fixture", isActive: true, sessionVersion: 2 }, select: { sessionVersion: true } });
    expect(mocks.sign).toHaveBeenCalledWith({ sub: "fixture", email: "fixture@example.test", version: 2 });
  });
  it("does not mint a new cookie when the authenticated version was invalidated", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(createSession("fixture", "fixture@example.test", 0)).rejects.toMatchObject({ status: 401 });
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

it("does not issue a cookie when session audit persistence fails", async () => {
  mocks.audit.mockRejectedValue(new Error("audit unavailable"));
  await expect(createSession("fixture", "fixture@example.test", 2)).rejects.toThrow("audit unavailable");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("persists revocation and clears the cookie even when its audit fails", async () => {
  mocks.audit.mockRejectedValue(new Error("audit unavailable"));
  await expect(destroySession()).rejects.toThrow("audit unavailable");
  expect(mocks.revoke).toHaveBeenCalledWith(mocks.claims);
  expect(mocks.set).toHaveBeenCalledWith("store_session", "", expect.objectContaining({ maxAge: 0 }));
});
it("security audit metadata excludes token, email and password", async () => {
  await createSession("fixture", "fixture@example.test", 2);
  await destroySession();
  expect(mocks.audit.mock.calls.map(call => call[0])).toEqual([
    {userId:"fixture",action:"auth.session.created",entity:"User",entityId:"fixture"},
    {userId:"fixture",action:"auth.session.revoked",entity:"User",entityId:"fixture"},
  ]);
});
