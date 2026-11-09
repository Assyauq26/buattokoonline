import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  approve: vi.fn(),
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
vi.mock("@/modules/auth/registration-otp-email", () => ({
  checkMailBrandChange: m.approve,
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
  m.approve.mockResolvedValue(undefined);
});
it("all publishing paths check the persisted candidate brand before writing", async () => {
  await executeAppearanceCommand({
    kind: "publish",
    draftVersion: 1,
    publishedVersion: 0,
  });
  expect(m.approve).toHaveBeenCalledWith("New Brand");
  expect(m.change).toHaveBeenCalledOnce();
});
it("a relay refusal prevents publishing from the legacy appearance API too", async () => {
  m.approve.mockRejectedValue(new Error("not approved"));
  await expect(
    executeAppearanceCommand({
      kind: "publish",
      draftVersion: 1,
      publishedVersion: 0,
    }),
  ).rejects.toThrow("not approved");
  expect(m.change).not.toHaveBeenCalled();
});
