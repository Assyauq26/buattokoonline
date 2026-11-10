import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { getCurrentUser } from "@/lib/auth/session";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import { whatsappRelay } from "@/modules/whatsapp/relay";
import { prisma } from "@/lib/prisma";
import { drainWhatsAppOutbox } from "@/modules/whatsapp/outbox";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.enum([
        "status",
        "connect",
        "disconnect",
        "qr",
        "history",
        "preferences",
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      enabled: z.boolean(),
      preparing: z.boolean(),
    })
    .strict(),
]);
export const runtime = "nodejs";
export async function POST(req: Request) {
  const response = await handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser(false);
    if (!user?.roles.includes("Admin"))
      throw new HttpError(
        "Hanya pemilik toko yang dapat mengelola WhatsApp.",
        403,
      );
    const input = schema.parse(await readJntJson(req, 1024));
    if (input.action === "retry")
      return ok(await whatsappRelay("notifications/retry", { id: input.id }));
    const path = ["history", "preferences", "save"].includes(input.action)
      ? "notifications/" +
        (input.action === "save" ? "preferences" : input.action)
      : "session/" + input.action;
    if (input.action === "save") {
      const values = {
        enabled: false,
        desiredEnabled: input.enabled,
        preparing: input.preparing,
        changedAt: new Date(),
        syncedAt: null,
      };
      await prisma.whatsAppPreference.upsert({
        where: { id: 1 },
        create: { id: 1, ...values },
        update: values,
      });
      try {
        await drainWhatsAppOutbox();
      } catch {
        /* Durable preference is retried by the worker. */
      }
      const current = await prisma.whatsAppPreference.findUniqueOrThrow({
        where: { id: 1 },
      });
      return ok({
        enabled: current.desiredEnabled,
        preparing: current.preparing,
        pending: !current.syncedAt,
      });
    }
    if (input.action === "preferences") {
      const current = await prisma.whatsAppPreference.findUnique({
        where: { id: 1 },
      });
      return ok({
        enabled: current?.desiredEnabled ?? false,
        preparing: current?.preparing ?? false,
        pending: current ? !current.syncedAt : false,
      });
    }
    const result = await whatsappRelay(path, {});
    return ok(result);
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
