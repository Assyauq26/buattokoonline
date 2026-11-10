import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { getCurrentUser } from "@/lib/auth/session";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { normalizeRegistrationPhone } from "@/modules/auth/registration-otp";
import { notificationsEnabled } from "@/modules/whatsapp/relay";
import { drainWhatsAppOutbox } from "@/modules/whatsapp/outbox";
export async function POST(req: Request) {
  const response = await handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser(false);
    if (!user || user.isAdmin)
      throw new HttpError("Masuk sebagai customer.", 403);
    if (!notificationsEnabled() || !user.phone)
      throw new HttpError("Notifikasi WhatsApp belum tersedia.", 503);
    const input = z
      .object({ granted: z.boolean() })
      .strict()
      .parse(await readJntJson(req, 512));
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        include: { roles: { include: { role: true } } },
      });
      if (
        !currentUser?.isActive ||
        currentUser.deletedAt ||
        !currentUser.phone ||
        !currentUser.roles.some((r) => r.role.name === "Customer") ||
        currentUser.roles.some((r) => ADMIN_ROLES.includes(r.role.name))
      )
        throw new HttpError("Masuk sebagai customer.", 403);
      const phone = normalizeRegistrationPhone(currentUser.phone);
      // Notifications require a verified number as well as explicit, separate consent.
      if (input.granted) {
        const identity = await tx.whatsAppIdentity.findFirst({
          where: {
            userId: user.id,
            phone,
            verifiedAt: { gt: new Date(Date.now() - 30 * 86400000) },
          },
          include: {
            user: {
              select: { sessionVersion: true, isActive: true, deletedAt: true },
            },
          },
        });
        if (
          !identity ||
          identity.sessionVersion !== identity.user.sessionVersion ||
          !identity.user.isActive ||
          identity.user.deletedAt
        )
          throw new HttpError(
            "Verifikasi nomor WhatsApp terlebih dahulu.",
            409,
          );
      }
      const now = new Date();
      await tx.whatsAppConsent.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          phone,
          granted: input.granted,
          changedAt: now,
        },
        update: {
          phone,
          granted: input.granted,
          changedAt: now,
          deliveredAt: null,
        },
      });
    });
    try {
      await drainWhatsAppOutbox();
      const current = await prisma.whatsAppConsent.findUnique({
        where: { userId: user.id },
      });
      return ok({ saved: true, pending: !current?.deliveredAt });
    } catch {
      return ok({ saved: true, pending: true });
    }
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
