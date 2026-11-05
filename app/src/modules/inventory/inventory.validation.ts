import { z } from "zod";
const stock = z.number().int().min(0).max(2_147_483_647);
export const stockAdjustmentSchema = z.object({ expectedOnHand: stock, newOnHand: stock, reason: z.string().trim().min(3, "Alasan minimal 3 karakter").max(2000) });
export function pageNumber(value?: string) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1; }
