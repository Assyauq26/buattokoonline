import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/admin/backoffice-access", () => ({
  requireBackofficeUser: m.actor,
}));
vi.mock("@/modules/audit/audit.service", () => ({ writeAudit: m.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (f: any) => f({ user: { updateMany: m.update } }),
  },
}));
import { saveSellerName } from "@/modules/admin/seller-profile.actions";
beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockResolvedValue({ id: "own-seller" });
  m.update.mockResolvedValue({ count: 1 });
});
it("updates only the authenticated seller name and checks the stored revision", async () => {
  const r = await saveSellerName({
    name: "Nama Baru",
    revision: "2026-11-09T08:00:00.000Z",
  });
  expect(r.ok).toBe(true);
  expect(m.update).toHaveBeenCalledWith({
    where: {
      id: "own-seller",
      isActive: true,
      updatedAt: new Date("2026-11-09T08:00:00.000Z"),
    },
    data: { name: "Nama Baru" },
  });
  expect(m.audit).toHaveBeenCalledOnce();
});
it("cannot change login identity or target another seller through this action", async () => {
  for (const extra of [
    { id: "other" },
    { email: "other@example.test" },
    { phone: "+6281234567890" },
  ]) {
    const r = await saveSellerName({
      name: "Nama Baru",
      revision: "2026-11-09T08:00:00.000Z",
      ...extra,
    });
    expect(r.ok).toBe(false);
  }
  expect(m.update).not.toHaveBeenCalled();
});
it("rejects stale forms instead of overwriting newer data", async () => {
  m.update.mockResolvedValue({ count: 0 });
  const r = await saveSellerName({
    name: "Nama Baru",
    revision: "2026-11-09T08:00:00.000Z",
  });
  expect(r.ok).toBe(false);
  expect(m.audit).not.toHaveBeenCalled();
});
