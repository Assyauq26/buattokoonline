import { z } from "zod";
import { handle, ok } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import {
  finishWhatsApp,
  startWhatsApp,
  unlinkWhatsApp,
  whatsAppStatus,
} from "@/modules/whatsapp/customer";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      phone: z.string().min(8).max(24),
      purpose: z.enum(["login", "link"]),
      accountType: z.enum(["customer", "seller"]).optional(),
      password: z.string().max(256).optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("finish"), code: z.string().regex(/^\d{6}$/) })
    .strict(),
  z
    .object({
      action: z.literal("confirm"),
      id: z.string().uuid(),
      token: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("status") }).strict(),
  z
    .object({
      action: z.literal("unlink"),
      accountType: z.enum(["customer", "seller"]).optional(),
      password: z.string().min(1).max(256),
    })
    .strict(),
]);
export const runtime = "nodejs";
export async function POST(req: Request) {
  const response = await handle(async () => {
    assertSameOrigin(req);
    const input = schema.parse(await readJntJson(req, 2048));
    return ok(
      input.action === "start"
        ? await startWhatsApp(input)
        : input.action === "confirm"
          ? await finishWhatsApp(undefined, {
              id: input.id,
              token: input.token,
            })
          : input.action === "finish"
            ? await finishWhatsApp(input.code)
            : input.action === "unlink"
              ? await unlinkWhatsApp(input.password, input.accountType)
              : await whatsAppStatus(),
    );
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
