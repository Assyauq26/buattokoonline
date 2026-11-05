import { z } from "zod";

export const shippingCourierSchema = z.enum(["J&T Express", "Pengiriman Manual"]);
export const maxManualShippingCost = 100_000_000;
export const manualShippingCost = z.number().int().min(0).max(maxManualShippingCost);

export function flatShippingRate(cost: number) {
  return { courier: "Pengiriman Manual", service: "Flat", cost: manualShippingCost.parse(cost), mode: "manual" as const };
}
