import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { completeSellerReset, deliverSellerReset, sellerOtpDigest, verifySellerReset } from "@/modules/auth/seller-password-reset";

const db = vi.hoisted(() => ({
  transaction: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(),
  updateMany: vi.fn(), deleteMany: vi.fn(), findSeller: vi.fn(), updateUser: vi.fn(),
  consume: vi.fn(), mail: vi.fn(), recovery: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: db.transaction,
  passwordResetToken: { findUnique: db.findUnique, updateMany: db.updateMany },
} }));
vi.mock("@/modules/auth/auth.service", () => ({
  lockRecoveryUser: vi.fn(), recoveryUser: db.recovery, sellerAccount: { isActive: true },
}));
vi.mock("@/lib/auth/rate-limit", () => ({ authRateLimitRealm: () => "test", consumeAuthBucket: db.consume }));
vi.mock("@/modules/auth/registration-otp-email", () => ({
  registrationMailConfig: () => ({ key: "dummy", from: "sender@example.com" }), sendResendEmail: db.mail,
}));
vi.mock("@/modules/audit/audit.service", () => ({ writeAudit: db.audit }));

const id = "12121212-1212-4121-8121-121212121212";
const user = { id: "seller-id", email: "seller@example.com" };
const code = "123456";
let record: { userId: string; token: string; expiresAt: Date; usedAt: Date | null };
const tx = {
  passwordResetToken: {
    findFirst: db.findFirst, create: db.create, update: db.update,
    updateMany: db.updateMany, deleteMany: db.deleteMany,
  },
  user: { findFirst: db.findSeller, update: db.updateUser },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JWT_SECRET", "unit-only-secret-for-seller-recovery-tests");
  record = { userId: user.id, token: sellerOtpDigest(id, code), expiresAt: new Date(Date.now() + 60_000), usedAt: null };
  db.transaction.mockImplementation(callback => callback(tx));
  db.findUnique.mockResolvedValue(record);
  db.findFirst.mockResolvedValue(record);
});
afterEach(() => vi.unstubAllEnvs());

it("rejects expired, used, and non-seller OTP records", async () => {
  for (const invalid of [
    { ...record, expiresAt: new Date(0) },
    { ...record, usedAt: new Date() },
    { ...record, token: "registration:" + record.token },
  ]) {
    db.findUnique.mockResolvedValueOnce(invalid);
    await expect(verifySellerReset(id, code)).rejects.toMatchObject({ status: 400 });
  }
  expect(db.transaction).not.toHaveBeenCalled();
});

it("charges wrong codes to the same challenge and rejects a blocked attempt", async () => {
  await expect(verifySellerReset(id, "654321")).rejects.toMatchObject({ status: 400 });
  expect(db.consume).toHaveBeenCalledWith(expect.stringContaining(":attempt:" + id), 5, record.expiresAt);
  db.consume.mockRejectedValueOnce(new Error("quota"));
  await expect(verifySellerReset(id, code)).rejects.toThrow("quota");
  expect(db.create).not.toHaveBeenCalled();
});

it("exchanges a valid OTP for a different, hashed grant and rejects OTP replay", async () => {
  db.update.mockImplementation(() => { record.usedAt = new Date(); });
  const token = await verifySellerReset(id, code);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(db.create.mock.calls[0][0].data.token).toMatch(/^seller-grant:[a-f0-9]{64}$/);
  expect(db.create.mock.calls[0][0].data.token).not.toContain(token);
  await expect(verifySellerReset(id, code)).rejects.toMatchObject({ status: 400 });
});

it("leaves an undelivered code expired and never mails an ineligible account", async () => {
  db.recovery.mockResolvedValue(user);
  db.findSeller.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
  db.findFirst.mockResolvedValue(null);
  await deliverSellerReset(user.email, id);
  expect(db.mail).not.toHaveBeenCalled();
  db.mail.mockRejectedValueOnce(new Error("provider offline"));
  await expect(deliverSellerReset(user.email, id)).rejects.toThrow("provider offline");
  expect(db.create.mock.calls[0][0].data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  expect(db.updateMany).toHaveBeenCalledTimes(1);
});

it("hashes the new password and revokes sessions and outstanding grants in one transaction", async () => {
  db.updateUser.mockResolvedValue(user);
  await expect(completeSellerReset("a".repeat(64), "passphrase yang panjang")).resolves.toBe(user.email);
  expect(db.findUnique.mock.calls[0][0].where.token).toMatch(/^seller-grant:/);
  expect(db.updateUser.mock.calls[0][0].data).toMatchObject({
    passwordHash: expect.stringMatching(/^\$2[aby]\$/), sessionVersion: { increment: 1 },
  });
  expect(db.updateMany.mock.calls[0][0].where).toEqual({ userId: user.id, usedAt: null });
  expect(db.audit.mock.calls[0][1]).toBe(tx);
});
