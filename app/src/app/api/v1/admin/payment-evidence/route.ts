import { z } from "zod";
import { handle, ok } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertSameOrigin } from "@/lib/mutation-origin";
import {
  createSource,
  disconnectSource,
} from "@/modules/payments/evidence/settings";
import {
  beginGoogleOAuth,
  boundedJson,
} from "@/modules/payments/evidence/google";
import { claimEvidence } from "@/modules/payments/evidence/repository";

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
      action: z.literal("claim"),
      evidenceId: z.string().min(1).max(100),
      attemptId: z.string().min(1).max(100),
      reason: z.string().min(15).max(1000),
    })
    .strict(),
]);
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requirePermission(PERMISSIONS.PAYMENT_READ);
    const input = command.parse(await boundedJson(req, 16_000));
    if (input.action === "create")
      return ok(await createSource(user.id, input.input), 201);
    if (input.action === "disconnect")
      return ok(await disconnectSource(user.id, input.sourceId));
    if (input.action === "connect-google")
      return ok({ url: await beginGoogleOAuth(user.id, input.sourceId) });
    return ok(
      await claimEvidence(
        user.id,
        input.evidenceId,
        input.attemptId,
        input.reason,
      ),
    );
  });
}
