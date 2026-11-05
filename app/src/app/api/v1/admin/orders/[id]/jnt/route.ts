import { z } from "zod";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok, HttpError } from "@/lib/response";
import {
  createJntAwb, getJntTracking, handoverJntPackage, cancelJntAwb, confirmJntDelivery,
} from "@/modules/shipping/jnt-fulfillment.service";

export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    pickupStart: z.string().max(25),
    pickupEnd: z.string().max(25),
  }).strict(),
  z.object({ action: z.literal("handover") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("track") }).strict(),
  z.object({
    action: z.literal("deliver"),
    evidenceReference: z.string().min(8).max(120),
    attested: z.literal(true),
  }).strict(),
]);
export async function POST(req: Request, context: {params: Promise<{id:string}>}) {
  return handle(async () => {
    assertSameOrigin(req);
    const { id } = await context.params;
    if (!id || id.length > 128) throw new HttpError("Pesanan tidak valid",422);
    if (Number(req.headers.get("content-length")||0)>4096)throw new HttpError("Request terlalu besar",413);
    const body = input.parse(await req.json());
    const permission = body.action === "track" ? PERMISSIONS.SHIPPING_READ :
      body.action === "create" ? PERMISSIONS.SHIPPING_CREATE : PERMISSIONS.SHIPPING_UPDATE;
    const actor = await requirePermission(permission);
    const data = body.action === "create" ? await createJntAwb(id,actor.id,body) :
      body.action === "deliver" ? await confirmJntDelivery(id,actor.id,body) :
      body.action === "cancel" ? await cancelJntAwb(id,actor.id) :
      body.action === "handover" ? await handoverJntPackage(id,actor.id) :
      await getJntTracking(id,actor.id);
    const response=ok(data);
    response.headers.set("Cache-Control","no-store");
    return response;
  });
}
