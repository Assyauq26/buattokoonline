import { z } from "zod";
const money = z.number().int().positive().max(2_147_483_647);
const date = z.coerce.date().refine(d => d.getTime() <= Date.now(), "Tanggal tidak boleh di masa depan");
export const refundRequestSchema = z.object({ requestId: z.string().uuid(), amount: money, reason: z.string().trim().min(3).max(2000) });
export const refundVerificationSchema = z.object({
  amount: money, sourceAccountId: z.string().min(1).max(64),
  evidenceReference: z.string().trim().min(8).max(160).transform(s => s.toUpperCase()),
  settledAt: date, verificationKind: z.literal("MANUAL_BANK_REVIEW"), attested: z.literal(true),
});
export const refundReturnSchema = z.object({
  requestId: z.string().uuid(), receivedAt: date, receiptReference: z.string().trim().min(6).max(160),
  physicalReturnVerified: z.literal(true), reason: z.string().trim().min(3).max(2000),
  items: z.array(z.object({ orderItemId: z.string().min(1).max(64), quantity: z.number().int().positive().max(2_147_483_647) })).min(1).max(100),
}).refine(v => new Set(v.items.map(i => i.orderItemId)).size === v.items.length, "Item retur duplikat");
