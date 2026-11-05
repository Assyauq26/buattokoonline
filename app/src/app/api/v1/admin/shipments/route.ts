import { operationOk } from "@/modules/admin/operations-cache";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { z } from "zod";
import { handle } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { upsertManualShipment } from "@/modules/shipping/shipping.service";
import { ShipmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const schema = z.object({
  orderId: z.string().min(1),
  courier: z.string().min(1),
  service: z.string().min(1),
  cost: z.number().int().nonnegative(),
  trackingNumber: z.string().optional(),
  shippedDate: z.string().optional(),
  estimatedDelivery: z.string().optional(),
  status: z.nativeEnum(ShipmentStatus),
  notes: z.string().optional(),
  requestId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  return handle(async () => { assertMutationOrigin(req);
    const admin = await requirePermission(PERMISSIONS.SHIPPING_UPDATE);
    const b = schema.parse(await req.json());
    const shipment = await upsertManualShipment(b.orderId, admin.id, {
      courier: b.courier, service: b.service, cost: b.cost,
      trackingNumber: b.trackingNumber,
      shippedDate: b.shippedDate === undefined ? undefined : b.shippedDate ? new Date(b.shippedDate) : null,
      estimatedDelivery: b.estimatedDelivery === undefined ? undefined : b.estimatedDelivery ? new Date(b.estimatedDelivery) : null,
      status: b.status, notes: b.notes, requestId: b.requestId,
    });
    return operationOk(shipment);
  });
}
