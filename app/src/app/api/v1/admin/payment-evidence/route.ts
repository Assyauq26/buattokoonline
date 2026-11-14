import { z } from "zod";
import { handle, ok } from "@/lib/response";
import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { reviewGmailNow } from "@/modules/payments/evidence/gmail-review";
import { assertSameOrigin } from "@/lib/mutation-origin";
import {
  createSource,
  disconnectSource,
} from "@/modules/payments/evidence/settings";
import {
  beginGoogleOAuth,
  boundedJson,
} from "@/modules/payments/evidence/google";

export const dynamic = "force-dynamic";
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: z.unknown() }).strict(),
  z
    .object({
      action: z.literal("disconnect"),
      sourceId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("connect-google"),
      sourceId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("read-google"),
      sourceId: z.string().min(1).max(100),
    })
    .strict(),
]);
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireEvidenceAdmin();
    const input = command.parse(await boundedJson(req, 16_000));
    if (input.action === "create")
      return ok(await createSource(user.id, input.input), 201);
    if (input.action === "disconnect")
      return ok(await disconnectSource(user.id, input.sourceId));
    if (input.action === "connect-google")
      return ok({ url: await beginGoogleOAuth(user.id, input.sourceId) });
    return ok(await reviewGmailNow(user.id, input.sourceId));
  });
}
