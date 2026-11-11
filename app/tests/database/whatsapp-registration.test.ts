import { afterAll, beforeAll, it, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("@/modules/appearance/service", () => ({
  readPublishedUncached: async () => ({
    config: { identity: { name: "Synthetic" } },
  }),
}));
import { prisma } from "@/lib/prisma";
import { verifyRegistrationOtp } from "@/modules/auth/auth.service";
import { hashRegistrationOtp } from "@/modules/auth/registration-otp";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/management_v130_test")
  throw Error("Isolated local database required");
const emails: string[] = [],
  challenges: string[] = [];
beforeAll(async () => {
  process.env.JWT_SECRET = "synthetic-registration-only-key-".repeat(3);
  process.env.STORE_ISOLATED_TESTS = "1";
  process.env.STORE_WHATSAPP_AUTH_ENABLED = "1";
  await prisma.role.upsert({
    where: { name: "Customer" },
    update: {},
    create: { name: "Customer", label: "Customer" },
  });
});
afterAll(async () => {
  const ids = (
    await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    })
  ).map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.pendingRegistration.deleteMany({
    where: { email: { in: emails } },
  });
  await prisma.whatsAppChallenge.deleteMany({
    where: { id: { in: challenges } },
  });
  await prisma.$disconnect();
});
async function fixture(expired = false) {
  const email = randomUUID() + "@example.test",
    id = randomUUID(),
    phone =
      "+628" +
      String(BigInt("0x" + randomBytes(5).toString("hex"))).slice(0, 10);
  emails.push(email);
  await prisma.pendingRegistration.create({
    data: {
      id,
      email,
      name: "Synthetic registration",
      phone,
      passwordHash: "unused",
      codeHash: hashRegistrationOtp(email, "123456", id),
      expiresAt: new Date(Date.now() + 300000),
    },
  });
  const proof = await prisma.whatsAppChallenge.create({
    data: {
      centralId: randomUUID(),
      phone,
      browserHash: "a".repeat(64),
      purpose: "login",
      state: "verified",
      expiresAt: new Date(Date.now() + (expired ? -1000 : 300000)),
    },
  });
  challenges.push(proof.id);
  return { email, id, proof: { id: proof.id, hash: proof.browserHash } };
}
it("phone proof cannot bypass email OTP; correct email OTP atomically creates only a customer identity and consumes proof", async () => {
  const f = await fixture();
  await expect(
    verifyRegistrationOtp(f.email, "000000", f.id, f.proof),
  ).rejects.toThrow();
  expect(
    await prisma.user.findUnique({ where: { email: f.email } }),
  ).toBeNull();
  const user = await verifyRegistrationOtp(f.email, "123456", f.id, f.proof);
  expect(
    (
      await prisma.whatsAppIdentity.findUniqueOrThrow({
        where: { userId: user.id },
      })
    ).phone,
  ).toBe(user.phone);
  expect(
    (
      await prisma.whatsAppChallenge.findUniqueOrThrow({
        where: { id: f.proof.id },
      })
    ).state,
  ).toBe("consumed");
  expect(
    (
      await prisma.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      })
    ).map((r) => r.role.name),
  ).toEqual(["Customer"]);
  await expect(
    verifyRegistrationOtp(f.email, "123456", f.id, f.proof),
  ).rejects.toThrow();
});
it.each(["wrong_browser", "expired"] as const)(
  "%s proof never links the newly email-verified customer",
  async (kind) => {
    const f = await fixture(kind === "expired");
    if (kind === "wrong_browser") f.proof.hash = "b".repeat(64);
    const user = await verifyRegistrationOtp(f.email, "123456", f.id, f.proof);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(
      await prisma.whatsAppIdentity.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
  },
);
