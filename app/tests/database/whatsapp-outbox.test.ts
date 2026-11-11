import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
const relay = vi.hoisted(() => vi.fn());
vi.mock("@/modules/whatsapp/relay", () => ({
  notificationsEnabled: () => true,
  whatsappRelay: relay,
}));
import { prisma } from "@/lib/prisma";
import { drainWhatsAppOutbox } from "@/modules/whatsapp/outbox";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/management_v130_test")
  throw Error("Isolated local database required");
let userId: string;
const phone = "+6281999999901";
const orders: string[] = [];
beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        name: "Synthetic outbox",
        email: randomUUID() + "@example.test",
        phone,
        passwordHash: "unused",
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
});
beforeEach(async () => {
  await prisma.whatsAppWorkerLease.deleteMany();
  await prisma.whatsAppConsentEvent.updateMany({
    where: { state: "pending" },
    data: { state: "fixture_skipped" },
  });
  await prisma.whatsAppOutbox.updateMany({
    where: { state: "pending" },
    data: { state: "fixture_skipped" },
  });
  await prisma.whatsAppPreference.update({
    where: { id: 1 },
    data: { enabled: true, desiredEnabled: true, syncedAt: new Date() },
  });
  relay.mockReset().mockResolvedValue({ saved: true, state: "queued" });
});
afterAll(async () => {
  await prisma.whatsAppPreference.update({
    where: { id: 1 },
    data: { enabled: false, desiredEnabled: false, syncedAt: new Date() },
  });
  await prisma.order.deleteMany({ where: { id: { in: orders } } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.whatsAppOutbox.deleteMany({
    where: { orderId: { in: orders } },
  });
  await prisma.whatsAppOrderHead.deleteMany({
    where: { orderId: { in: orders } },
  });
  await prisma.whatsAppConsentEvent.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});
async function order() {
  await prisma.whatsAppConsent.upsert({
    where: { userId },
    create: { userId, phone, granted: true, deliveredAt: new Date() },
    update: {
      phone,
      granted: true,
      changedAt: new Date(),
      deliveredAt: new Date(),
    },
  });
  await prisma.whatsAppConsentEvent.updateMany({
    where: { userId },
    data: { state: "saved" },
  });
  const o = await prisma.order.create({
    data: {
      userId,
      orderNumber: "ORD-" + randomUUID().replaceAll("-", "").toUpperCase(),
      subtotal: 10000,
      total: 10000,
      address: {
        create: {
          recipientName: "Synthetic",
          phone,
          line: "Test",
          city: "Test",
          province: "Test",
          postalCode: "",
        },
      },
    },
  });
  orders.push(o.id);
  // Two committed signals are coalesced to the newer aggregate.
  await drainWhatsAppOutbox();
  return o;
}
it("checkout commits while gateway is down; immutable payload is durable before submission and timeout retries same ID", async () => {
  const o = await order();
  const item = await prisma.whatsAppOutbox.findFirstOrThrow({
    where: { orderId: o.id, state: "pending" },
  });
  relay.mockImplementation(async (path, input) => {
    expect(path).toBe("notifications/event");
    expect(
      (
        await prisma.whatsAppOutbox.findUniqueOrThrow({
          where: { revision: item.revision },
        })
      ).payload,
    ).toEqual(input);
    throw Error("timeout after accept");
  });
  expect((await drainWhatsAppOutbox()).state).toBe("pending");
  expect(await prisma.order.findUnique({ where: { id: o.id } })).not.toBeNull();
  const sent = relay.mock.calls[0][1];
  await prisma.whatsAppOutbox.update({
    where: { revision: item.revision },
    data: { nextAt: new Date(0) },
  });
  relay.mockResolvedValue({ state: "queued" });
  expect((await drainWhatsAppOutbox()).state).toBe("queued");
  expect(relay.mock.calls[1][1]).toEqual(sent);
  expect(
    (
      await prisma.whatsAppOutbox.findUniqueOrThrow({
        where: { revision: item.revision },
      })
    ).payload,
  ).toBeNull();
});
it("double worker invocation uses one durable lease", async () => {
  await order();
  let release!: () => void;
  const waiting = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const ready = new Promise<void>((r) => (entered = r));
  relay.mockImplementation(async () => {
    entered();
    await waiting;
    return { state: "queued" };
  });
  const first = drainWhatsAppOutbox();
  await ready;
  expect((await drainWhatsAppOutbox()).state).toBe("busy");
  release();
  await first;
  expect(relay).toHaveBeenCalledTimes(1);
});
it("phone replacement preserves old revocation before new grant and survives user deletion", async () => {
  await prisma.whatsAppConsent.upsert({
    where: { userId },
    create: { userId, phone, granted: true },
    update: { phone, granted: true, changedAt: new Date() },
  });
  await prisma.whatsAppConsentEvent.updateMany({
    where: { userId },
    data: { state: "saved" },
  });
  await prisma.whatsAppConsent.update({
    where: { userId },
    data: { phone: "+6281999999902", changedAt: new Date() },
  });
  await drainWhatsAppOutbox();
  expect(relay.mock.calls[0][1]).toMatchObject({ phone, granted: false });
  await prisma.whatsAppConsent.delete({ where: { userId } });
  await drainWhatsAppOutbox();
  expect(relay.mock.calls[1][1]).toMatchObject({
    phone: "+6281999999902",
    granted: false,
  });
});
it("stale grants expire without blocking revocations or refreshing consent", async () => {
  await prisma.whatsAppConsent.upsert({
    where: { userId },
    create: { userId, phone, granted: true, changedAt: new Date(0) },
    update: { phone, granted: true, changedAt: new Date(0), deliveredAt: null },
  });
  expect((await drainWhatsAppOutbox()).state).toBe("consent_expired");
  expect(relay).not.toHaveBeenCalled();
  expect(
    (await prisma.whatsAppConsent.findUniqueOrThrow({ where: { userId } }))
      .granted,
  ).toBe(false);
  await drainWhatsAppOutbox();
  expect(relay.mock.calls[0][1].granted).toBe(false);
});
it("disabling preferences remains queued through outage then cancels central queue before more events", async () => {
  await prisma.whatsAppPreference.update({
    where: { id: 1 },
    data: {
      enabled: false,
      desiredEnabled: false,
      changedAt: new Date(),
      syncedAt: null,
    },
  });
  relay.mockRejectedValueOnce(Error("offline"));
  expect((await drainWhatsAppOutbox()).state).toBe("preferences_pending");
  expect(
    (await prisma.whatsAppPreference.findUniqueOrThrow({ where: { id: 1 } }))
      .syncedAt,
  ).toBeNull();
  expect((await drainWhatsAppOutbox()).state).toBe("preferences_saved");
  expect(relay.mock.calls[1]).toEqual([
    "notifications/preferences",
    { enabled: false, preparing: false },
  ]);
});
