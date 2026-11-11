import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  change: vi.fn(),
  read: vi.fn(),
  history: vi.fn(),
  invalidate: vi.fn(),
  invalidateAdmin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
// Sender-registry checks have their own integration/command tests; this suite
// exercises authorization and post-commit cache invalidation.
vi.mock("@/modules/auth/mail-brand-sync", () => ({
  syncPendingMailBrand: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth/session", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/prisma", () => ({
  prisma: { storeAppearanceRevision: { findMany: mocks.history } },
}));
vi.mock("@/modules/appearance/service", () => ({
  changeAppearance: mocks.change,
  readDraft: mocks.read,
}));
vi.mock("@/modules/appearance/session", () => ({
  appearanceSessionHash: async () => "verified-session-hash",
}));
vi.mock("@/modules/appearance/published", () => ({
  APPEARANCE_TAG: "test-appearance",
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.invalidate, revalidatePath: mocks.invalidateAdmin }));
import {
  appearanceAction,
  appearanceHistory,
  loadAppearance,
} from "@/modules/appearance/actions";
import { HttpError } from "@/lib/response";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ id: "admin", isAdmin: true });
  mocks.change.mockResolvedValue({ draftVersion: 1, publishedVersion: 0 });
  mocks.read.mockResolvedValue({ draftVersion: 0, config: { identity: { name: "Toko" } } });
});
describe("appearance server actions", () => {
  it("denies a customer identity even with a misplaced DB permission", async () => { mocks.permission.mockResolvedValue({id:"customer",isAdmin:false}); expect((await appearanceAction({kind:"save",draftVersion:0,publishedVersion:0})).ok).toBe(false); expect(mocks.change).not.toHaveBeenCalled(); });
  it.each(["save", "reset", "discard", "publish", "rollback"] as const)(
    "%s checks authoritative permission before mutation",
    async (kind) => {
      mocks.permission.mockRejectedValue(new HttpError("Tidak diizinkan", 403));
      const r = await appearanceAction({
        kind,
        draftVersion: 0,
        publishedVersion: 0,
      });
      expect(r.ok).toBe(false);
      expect(mocks.change).not.toHaveBeenCalled();
      expect(mocks.invalidate).not.toHaveBeenCalled();
    },
  );
  it.each([loadAppearance, appearanceHistory])(
    "private read denies unauthorized",
    async (read) => {
      mocks.permission.mockRejectedValue(new HttpError("Tidak diizinkan", 403));
      expect((await read()).ok).toBe(false);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.history).not.toHaveBeenCalled();
    },
  );
  it("save never invalidates public cache", async () => {
    expect(
      (
        await appearanceAction({
          kind: "save",
          draftVersion: 0,
          publishedVersion: 0,
        })
      ).ok,
    ).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("store.customize.update");
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.invalidateAdmin).toHaveBeenCalledWith("/admin", "layout");
  });
  it.each(["publish", "rollback"])(
    "%s invalidates only after commit",
    async (kind) => {
      await appearanceAction({ kind, draftVersion: 0, publishedVersion: 0 });
      expect(mocks.permission).toHaveBeenCalledWith("store.customize.publish");
      expect(mocks.invalidate).toHaveBeenCalledOnce();
      mocks.invalidate.mockClear();
      mocks.change.mockRejectedValueOnce(new HttpError("stale", 409));
      const r = await appearanceAction({
        kind,
        draftVersion: 0,
        publishedVersion: 0,
      });
      expect(r).toMatchObject({ ok: false, httpStatus: 409 });
      expect(mocks.invalidate).not.toHaveBeenCalled();
    },
  );
});
