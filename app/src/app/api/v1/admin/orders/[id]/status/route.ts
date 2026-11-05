import { operationOk } from "@/modules/admin/operations-cache";
import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle } from "@/lib/response";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { transitionOrder } from "@/modules/orders/orders.service";
export const dynamic = "force-dynamic";
const schema = z.object({ status: z.nativeEnum(OrderStatus) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { assertMutationOrigin(req); const actor = await requirePermission(PERMISSIONS.ORDER_UPDATE); const input = schema.parse(await req.json()); return operationOk(await transitionOrder((await params).id, input.status, actor.id)); });
}
