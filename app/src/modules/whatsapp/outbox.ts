import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { whatsappRelay, notificationsEnabled } from "./relay";
import { normalizeRegistrationPhone } from "@/modules/auth/registration-otp";
import { whatsappOrderEvent } from "./order-event";
const payloadSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string(),
  revision: z.number().int().positive(),
  type: z.string(),
  phone: z.string(),
  occurredAt: z.string(),
});

// A durable 45s lease spans the bounded 12s relay call. Payload is committed
// BEFORE external I/O. A crash retries the same event, never a provider send.
export async function drainWhatsAppOutbox() {
  if (!notificationsEnabled()) return { state: "disabled" };
  const token = randomUUID();
  const lease =
    await prisma.$executeRaw`INSERT INTO "WhatsAppWorkerLease"(id,token,"expiresAt") VALUES(1,${token},timezone('UTC',now())+interval '45 seconds') ON CONFLICT(id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "WhatsAppWorkerLease"."expiresAt"<timezone('UTC',now())`;
  if (!lease) return { state: "busy" };
  try {
    return await drain();
  } finally {
    await prisma.whatsAppWorkerLease.deleteMany({ where: { id: 1, token } });
  }
}
async function drain() {
  const preference = await prisma.whatsAppPreference.findUnique({
    where: { id: 1 },
  });
  if (preference && !preference.syncedAt) {
    try {
      await whatsappRelay("notifications/preferences", {
        enabled: preference.desiredEnabled,
        preparing: preference.preparing,
      });
      await prisma.whatsAppPreference.updateMany({
        where: { id: 1, changedAt: preference.changedAt },
        data: { enabled: preference.desiredEnabled, syncedAt: new Date() },
      });
      return { state: "preferences_saved" };
    } catch {
      return { state: "preferences_pending" };
    }
  }
  // Revocations go first and never expire. An old grant is not silently refreshed.
  const consent = await prisma.whatsAppConsentEvent.findFirst({
    where: { state: "pending" },
    orderBy: [{ granted: "asc" }, { revision: "asc" }],
  });
  if (consent) {
    if (consent.granted && Date.now() - consent.changedAt.getTime() > 300000) {
      await prisma.$transaction(async (tx) => {
        await tx.whatsAppConsentEvent.update({
          where: { revision: consent.revision },
          data: { state: "expired" },
        });
        await tx.whatsAppConsent.updateMany({
          where: {
            userId: consent.userId,
            phone: consent.phone,
            changedAt: consent.changedAt,
          },
          data: { granted: false, changedAt: new Date(), deliveredAt: null },
        });
      });
      return { state: "consent_expired" };
    }
    try {
      const result = await whatsappRelay<{ saved: boolean }>(
        "notifications/consent",
        {
          phone: consent.phone,
          granted: consent.granted,
          occurredAt: consent.changedAt.toISOString(),
        },
      );
      await prisma.$transaction(async (tx) => {
        await tx.whatsAppConsentEvent.update({
          where: { revision: consent.revision },
          data: { state: "saved" },
        });
        if (!result.saved && consent.granted) {
          // A newer STOP/revocation at the relay wins. Reflect that locally;
          // never leave an apparently enabled preference that cannot deliver.
          await tx.whatsAppConsent.updateMany({
            where: {
              userId: consent.userId,
              phone: consent.phone,
              changedAt: consent.changedAt,
            },
            data: { granted: false, changedAt: new Date(), deliveredAt: null },
          });
        } else if (result.saved)
          await tx.whatsAppConsent.updateMany({
            where: {
              userId: consent.userId,
              phone: consent.phone,
              changedAt: consent.changedAt,
            },
            data: { deliveredAt: new Date() },
          });
      });
      return { state: "consent_saved" };
    } catch {
      return { state: "consent_pending" };
    }
  }
  await prisma.whatsAppOutbox.updateMany({
    where: {
      state: "pending",
      createdAt: { lt: new Date(Date.now() - 3600000) },
    },
    data: { state: "expired", payload: Prisma.DbNull },
  });
  if (!preference?.enabled) {
    await prisma.whatsAppOutbox.updateMany({
      where: { state: "pending" },
      data: { state: "cancelled", payload: Prisma.DbNull },
    });
    return { state: "disabled" };
  }
  const prepared = await prisma.$transaction(async (tx) => {
    const item = await tx.whatsAppOutbox.findFirst({
      where: { state: "pending", nextAt: { lte: new Date() } },
      orderBy: { revision: "asc" },
    });
    if (!item) return { state: "idle" } as const;
    const finish = async (state: string) => {
      await tx.whatsAppOutbox.update({
        where: { revision: item.revision },
        data: { state, payload: Prisma.DbNull },
      });
      return { state };
    };
    const order = await tx.order.findUnique({
      where: { id: item.orderId },
      include: {
        address: true,
        shipment: true,
        jntShipmentRequest: true,
        resolutions: { orderBy: { createdAt: "desc" } },
      },
    });
    const newer = await tx.whatsAppOutbox.findFirst({
      where: { orderId: item.orderId, revision: { gt: item.revision } },
    });
    if (!order?.address || newer) return finish("superseded");
    const permission = await tx.whatsAppConsent.findUnique({
      where: { userId: order.userId },
    });
    let phone;
    try {
      phone = normalizeRegistrationPhone(order.address.phone);
    } catch {
      phone = null;
    }
    if (
      !phone ||
      !permission?.granted ||
      permission.phone !== phone ||
      !permission.deliveredAt
    )
      return finish("no_consent");
    const type = whatsappOrderEvent(order);
    if (!type) return finish("ignored");
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          type,
          phone,
          order.jntShipmentRequest?.awb || null,
          order.resolutions[0]?.id || null,
        ]),
      )
      .digest("hex");
    if (
      !item.payload &&
      (await tx.whatsAppOrderHead.findUnique({ where: { orderId: order.id } }))
        ?.fingerprint === fingerprint
    )
      return finish("duplicate");
    const payload = payloadSchema.parse(
      item.payload || {
        id: item.eventId,
        orderId: order.orderNumber,
        revision: Number(item.revision),
        type,
        phone,
        occurredAt: item.createdAt.toISOString(),
      },
    );
    // Never change a payload whose event ID may already have reached the relay.
    if (payload.phone !== phone) return finish("superseded");
    await tx.whatsAppOutbox.update({
      where: { revision: item.revision },
      data: { payload },
    });
    return { state: "prepared", item, payload, fingerprint };
  });
  if (
    !("item" in prepared) ||
    !prepared.item ||
    !prepared.payload ||
    !prepared.fingerprint
  )
    return { state: prepared.state };
  const { item, payload, fingerprint } = prepared;
  try {
    const result = await whatsappRelay<{ state: string }>(
      "notifications/event",
      payload,
    );
    await prisma.$transaction(async (tx) => {
      await tx.whatsAppOutbox.update({
        where: { revision: item.revision },
        data: {
          state: "accepted",
          payload: Prisma.DbNull,
          attempts: { increment: 1 },
        },
      });
      await tx.whatsAppOrderHead.upsert({
        where: { orderId: item.orderId },
        create: { orderId: item.orderId, fingerprint },
        update: { fingerprint },
      });
    });
    return { state: result.state };
  } catch {
    const state = item.attempts >= 5 ? "failed" : "pending";
    await prisma.whatsAppOutbox.update({
      where: { revision: item.revision },
      data: {
        attempts: { increment: 1 },
        state,
        nextAt: new Date(
          Date.now() + Math.min(900, 30 * 2 ** item.attempts) * 1000,
        ),
      },
    });
    return { state };
  }
}
