import { z } from "zod";
import { handle, ok } from "@/lib/response";
import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { reviewGmailNow } from "@/modules/payments/evidence/gmail-review";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { createBluTestOrder, listBluTestOrders, testOrderInput } from "@/modules/payments/evidence/test-orders";
import { setBluEnabled } from "@/modules/payments/evidence/blu-activation";
import { approveBluManually, bluApprovalInput, reconcileBluSource, bluReviewInput, recordBluReview } from "@/modules/payments/evidence/blu-reconciliation";
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
  z.object({ action: z.literal("set-blu-enabled"), sourceId: z.string().min(1).max(100), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("approve-blu"), input: bluApprovalInput }).strict(),
  z.object({ action: z.literal("recheck-blu"), sourceId: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("record-blu-review"), input: bluReviewInput }).strict(),
  z.object({ action: z.literal("create-test"), input: testOrderInput }).strict(),
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
    if (input.action === "set-blu-enabled") return ok(await setBluEnabled(user.id, input.sourceId, input.enabled));
    if (input.action === "approve-blu") return ok(await approveBluManually(user.id, input.input));
    if (input.action === "record-blu-review") return ok(await recordBluReview(user.id, input.input));
    if (input.action === "recheck-blu") return ok({ ...await reconcileBluSource(input.sourceId, user.id, new Date(), Date.now() + 10000, true), reconciled: true });
    if (input.action === "create-test") return ok(await createBluTestOrder(user.id, input.input), 201);
    if (input.action === "create")
      return ok(await createSource(user.id, input.input), 201);
    if (input.action === "disconnect")
      return ok(await disconnectSource(user.id, input.sourceId));
    if (input.action === "connect-google")
      return ok({ url: await beginGoogleOAuth(user.id, input.sourceId) });
    const result = await reviewGmailNow(user.id, input.sourceId);
    const review = await reconcileBluSource(input.sourceId, user.id, new Date(), Date.now() + 10000, true);
    return ok({ ...result, reviewed: review.reviewed });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireEvidenceAdmin();
    const response = ok({ tests: await listBluTestOrders(user.id), serverNow: new Date().toISOString() });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
