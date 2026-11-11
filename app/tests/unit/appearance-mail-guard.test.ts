import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  sync: vi.fn(),
  change: vi.fn(),
  actor: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/modules/appearance/authorization", () => ({
  requireCustomizePermission: m.actor,
}));
vi.mock("@/modules/auth/mail-brand-sync", () => ({
  syncPendingMailBrand: m.sync,
}));
vi.mock("@/modules/appearance/service", () => ({
  changeAppearance: m.change,
  readDraft: async () => ({ config: { identity: { name: "New Brand" } } }),
}));
vi.mock("@/modules/appearance/session", () => ({
  appearanceSessionHash: async () => "session",
}));
vi.mock("@/modules/appearance/published", () => ({ APPEARANCE_TAG: "test" }));
vi.mock("@/lib/prisma", () => ({
  prisma: { storeAppearanceRevision: { findUnique: async () => null } },
}));
import { executeAppearanceCommand } from "@/modules/appearance/commands";
beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockResolvedValue({ id: "seller" });
  m.change.mockResolvedValue({ ok: true });
  m.sync.mockResolvedValue(undefined);
});
it("publishes before attempting sender synchronization", async () => {
  await executeAppearanceCommand({
    kind: "publish",
    draftVersion: 1,
    publishedVersion: 0,
  });
  expect(m.change).toHaveBeenCalledOnce();
  expect(m.sync).toHaveBeenCalledOnce();
  expect(m.change.mock.invocationCallOrder[0]).toBeLessThan(m.sync.mock.invocationCallOrder[0]);
});
it("a central outage does not undo a committed change", async () => {
  m.sync.mockRejectedValue(new Error("relay unavailable"));
  await expect(
    executeAppearanceCommand({
      kind: "publish",
      draftVersion: 1,
      publishedVersion: 0,
    }),
  ).resolves.toEqual({ ok: true });
  expect(m.change).toHaveBeenCalledOnce();
});
