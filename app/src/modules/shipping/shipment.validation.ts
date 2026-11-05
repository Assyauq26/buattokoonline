import { z } from "zod";
import { ShipmentStatus } from "@prisma/client";
export const manualShipmentSchema = z.object({
  courier: z.string().trim().min(1).max(100), service: z.string().trim().min(1).max(100),
  cost: z.number().int().nonnegative().max(2_147_483_647), status: z.nativeEnum(ShipmentStatus),
  trackingNumber: z.string().trim().max(160).optional(),
  shippedDate: z.date().nullable().optional(), estimatedDelivery: z.date().nullable().optional(),
  notes: z.string().trim().max(2000).optional(), requestId: z.string().uuid().optional(),
});
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ["PROCESSING", "SHIPPED"], PROCESSING: ["SHIPPED"],
  SHIPPED: ["IN_TRANSIT", "DELIVERED"], IN_TRANSIT: ["DELIVERED"], DELIVERED: [],
};
export function canTransitionShipment(from: ShipmentStatus | null, to: ShipmentStatus) {
  return from === null ? ["PENDING", "PROCESSING", "SHIPPED"].includes(to) : from === to || SHIPMENT_TRANSITIONS[from].includes(to);
}
