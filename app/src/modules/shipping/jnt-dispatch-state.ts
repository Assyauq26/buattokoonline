import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";

/** Caller holds Order lock: refunds must not race an external dispatch/cancel intent. */
export async function assertNoUnresolvedJntDispatch(tx: Prisma.TransactionClient, orderId: string) {
  const request = await tx.jntShipmentRequest.findUnique({ where: { orderId }, select: { state: true } });
  if (request && ["PREPARED", "DISPATCHED", "UNKNOWN"].includes(request.state)) {
    throw new HttpError("Permintaan J&T belum direkonsiliasi; refund dibekukan sementara", 409);
  }
}
