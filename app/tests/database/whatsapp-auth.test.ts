import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  relay: vi.fn(),
  session: vi.fn(),
  current: null as any,
  authenticated: null as any,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) =>
      mocks.jar.has(k) ? { value: mocks.jar.get(k) } : undefined,
    set: (k: string, v: string) => mocks.jar.set(k, v),
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => mocks.current,
  createSession: mocks.session,
}));
vi.mock("@/modules/auth/auth.service", () => ({
  authenticate: async (email: string, password: string) => {
    if (
      password !== "synthetic-password" ||
      email !== mocks.authenticated?.email
    )
      throw Error("wrong_password");
    return mocks.authenticated;
  },
}));
vi.mock("@/modules/whatsapp/relay", () => ({
  whatsappEnabled: () => process.env.STORE_WHATSAPP_AUTH_ENABLED === "1",
  whatsappRelay: mocks.relay,
}));
import { prisma } from "@/lib/prisma";
import {
  startWhatsApp,
  finishWhatsApp,
  unlinkWhatsApp,
} from "@/modules/whatsapp/customer";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/management_v130_test")
  throw Error("Isolated local database required");
let roleId: string,
  adminId: string,
  phone: string,
  centralId: string,
  purpose: string;
const users: string[] = [];
beforeAll(async () => {
  process.env.STORE_WHATSAPP_AUTH_ENABLED = "1";
  process.env.STORE_ISOLATED_TESTS = "1";
  process.env.APP_ORIGIN = "https://whatsapp.example.test";
  process.env.STORE_WHATSAPP_TENANT_ID = randomUUID();
  roleId = (
    await prisma.role.upsert({
      where: { name: "Customer" },
      update: {},
      create: { name: "Customer", label: "Customer" },
    })
  ).id;
  adminId = (
    await prisma.role.upsert({
      where: { name: "Admin" },
      update: {},
      create: { name: "Admin", label: "Admin" },
    })
  ).id;
});
beforeEach(() => {
  phone =
    "+628" + String(BigInt("0x" + randomBytes(5).toString("hex"))).slice(0, 10);
  centralId = randomUUID();
  purpose = "login";
  mocks.jar.clear();
  mocks.current = null;
  mocks.authenticated = null;
  mocks.session.mockReset();
  mocks.relay
    .mockReset()
    .mockImplementation(async (path: string, input: any) => {
      if (path === "auth/start") {
        purpose = input.purpose;
        return {
          id: centralId,
          expiresAt: new Date(Date.now() + 180000).toISOString(),
          whatsappUrl: "https://wa.me/6282211700060?text=BTOS",
        };
      }
      if (path === "auth/finish") return { exchange: "e".repeat(64) };
      if (path === "auth/exchange")
        return {
          phone,
          purpose,
          transaction: centralId,
          tenant: process.env.STORE_WHATSAPP_TENANT_ID,
          audience: process.env.APP_ORIGIN,
        };
    });
});
afterAll(async () => {
  await prisma.whatsAppChallenge.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
async function user(admin = false) {
  const u = await prisma.user.create({
    data: {
      name: "Synthetic",
      email: randomUUID() + "@example.test",
      phone,
      passwordHash: "unused",
      emailVerifiedAt: new Date(),
      roles: { create: { roleId: admin ? adminId : roleId } },
    },
  });
  users.push(u.id);
  return u;
}
async function linked(admin = false) {
  const u = await user(admin);
  await prisma.whatsAppIdentity.create({
    data: { userId: u.id, phone, sessionVersion: u.sessionVersion },
  });
  return u;
}
const start = () => startWhatsApp({ phone, purpose: "login" });
it("legacy contact phone does not grant account access", async () => {
  await user();
  await start();
  expect(await finishWhatsApp("123456")).toEqual({ state: "profile_required" });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(
    await prisma.whatsAppIdentity.findUnique({ where: { phone } }),
  ).toBeNull();
});
it("verified customer logs in exactly once under concurrent completion", async () => {
  const u = await linked();
  await start();
  const result = await Promise.allSettled([
    finishWhatsApp("123456"),
    finishWhatsApp("123456"),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(mocks.session).toHaveBeenCalledExactlyOnceWith(
    u.id,
    u.email,
    u.sessionVersion,
  );
  await expect(finishWhatsApp("123456")).rejects.toThrow();
});
it("another browser cannot consume challenge", async () => {
  await linked();
  await start();
  mocks.jar.clear();
  await expect(finishWhatsApp("123456")).rejects.toThrow();
  expect(
    mocks.relay.mock.calls.filter((c) => c[0] === "auth/finish"),
  ).toHaveLength(0);
});
it("expired local challenge is rejected before contacting central", async () => {
  await linked();
  await start();
  await prisma.whatsAppChallenge.update({
    where: { centralId },
    data: { expiresAt: new Date(0) },
  });
  await expect(finishWhatsApp("123456")).rejects.toThrow();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("wrong tenant/audience/phone/purpose cannot create session", async () => {
  await linked();
  await start();
  const implementation = mocks.relay.getMockImplementation()!;
  mocks.relay.mockImplementation(async (p, i) =>
    p === "auth/exchange"
      ? {
          phone,
          purpose: "login",
          transaction: centralId,
          tenant: randomUUID(),
          audience: process.env.APP_ORIGIN,
        }
      : implementation(p, i),
  );
  await expect(finishWhatsApp("123456")).rejects.toThrow();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("customer WhatsApp never creates a seller session", async () => {
  await linked(true);
  await start();
  expect((await finishWhatsApp("123456")).state).toBe("profile_required");
  expect(mocks.session).not.toHaveBeenCalled();
});
it("reset session version and stale ownership require password relinking", async () => {
  const u = await linked();
  await prisma.user.update({
    where: { id: u.id },
    data: { sessionVersion: { increment: 1 } },
  });
  await start();
  expect((await finishWhatsApp("123456")).state).toBe("profile_required");
  expect(mocks.session).not.toHaveBeenCalled();
});
it("linking requires authenticated account password and rotates sessions", async () => {
  const u = await user();
  mocks.current = { ...u, isAdmin: false, roles: ["Customer"] };
  mocks.authenticated = u;
  await expect(
    startWhatsApp({ phone, purpose: "link", password: "wrong" }),
  ).rejects.toThrow();
  await startWhatsApp({
    phone,
    purpose: "link",
    password: "synthetic-password",
  });
  expect((await finishWhatsApp("123456")).state).toBe("linked");
  expect(
    (
      await prisma.whatsAppIdentity.findUniqueOrThrow({
        where: { userId: u.id },
      })
    ).sessionVersion,
  ).toBe(1);
  expect(mocks.session).toHaveBeenCalledWith(u.id, u.email, 1);
});
it("phone change removes verified identity and revokes existing sessions", async () => {
  const u = await linked();
  await prisma.whatsAppConsent.create({
    data: { userId: u.id, phone, granted: true, deliveredAt: new Date() },
  });
  const changed = await prisma.user.update({
    where: { id: u.id },
    data: { phone: "+627" + phone.slice(4) },
  });
  expect(changed.sessionVersion).toBe(1);
  expect(
    await prisma.whatsAppIdentity.findUnique({ where: { userId: u.id } }),
  ).toBeNull();
  expect(
    (
      await prisma.whatsAppConsent.findUniqueOrThrow({
        where: { userId: u.id },
      })
    ).granted,
  ).toBe(false);
});
it("unlink requires password, revokes sessions and queues consent revocation", async () => {
  const u = await linked();
  mocks.current = { ...u, isAdmin: false, roles: ["Customer"] };
  mocks.authenticated = u;
  await prisma.whatsAppConsent.create({
    data: { userId: u.id, phone, granted: true },
  });
  await expect(unlinkWhatsApp("wrong")).rejects.toThrow();
  await unlinkWhatsApp("synthetic-password");
  expect(
    await prisma.whatsAppIdentity.findUnique({ where: { userId: u.id } }),
  ).toBeNull();
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
      .sessionVersion,
  ).toBe(1);
  expect(
    (
      await prisma.whatsAppConsent.findUniqueOrThrow({
        where: { userId: u.id },
      })
    ).granted,
  ).toBe(false);
});
