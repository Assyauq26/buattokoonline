import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/admin/backoffice-access", () => ({
  requireBackofficeUser: m.actor,
}));
vi.mock("@/modules/audit/audit.service", () => ({ writeAudit: m.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (f: any) =>
      f({
        whatsAppIdentity: { findUnique: async () => null },
        $queryRaw: m.lock,
        user: { findFirst: m.find, update: m.update },
      }),
  },
}));
import { saveSellerName } from "@/modules/admin/seller-profile.actions";
const revision = "2026-11-09T08:00:00.000Z";
beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockResolvedValue({ id: "own-seller" });
  m.find.mockResolvedValue({ id: "own-seller", updatedAt: new Date(revision) });
  m.update.mockImplementation(async ({ data }: any) => ({ ...data }));
});
it("stores normalized contact without changing authentication identity", async () => {
  const result = await saveSellerName({
    name: "Nama Baru",
    phone: "0812 3456 7890",
    revision,
  });
  expect(result.ok).toBe(true);
  const call = m.update.mock.calls[0][0];
  expect(call.where).toEqual({ id: "own-seller" });
  expect(call.data.sellerContactPhone).toBe("+6281234567890");
  for (const key of [
    "phone",
    "email",
    "passwordHash",
    "sessionVersion",
    "emailVerifiedAt",
  ])
    expect(call.data).not.toHaveProperty(key);
  expect(m.audit).toHaveBeenCalledOnce();
});
it("keeps a cleared contact empty rather than restoring the login phone", async () => {
  const result = await saveSellerName({
    name: "Nama Baru",
    phone: "",
    revision,
  });
  expect(result.ok).toBe(true);
  expect(result.data?.phone).toBe("");
});
it("rejects identity injection and invalid phone without changing data", async () => {
  for (const value of [
    { id: "other" },
    { email: "other@example.test" },
    { phone: "123" },
    { phone: "+62+6281234567890" },
    { sellerContactPhone: "+6281234567890" },
  ]) {
    expect(
      (
        await saveSellerName({
          name: "Nama Baru",
          phone: "081234567890",
          revision,
          ...value,
        })
      ).ok,
    ).toBe(false);
  }
  expect(m.update).not.toHaveBeenCalled();
});
it("rejects stale revision and revoked staff access", async () => {
  m.find
    .mockResolvedValueOnce({ updatedAt: new Date("2026-11-10T08:00:00.000Z") })
    .mockResolvedValueOnce(null);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await saveSellerName({
          name: "Nama Baru",
          phone: "081234567890",
          revision,
        })
      ).ok,
    ).toBe(false);
  expect(m.update).not.toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
});
