import { z } from "zod";

const rupiah = z.number().int().min(0).max(2_147_483_647);
export const voucherInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, "Kode voucher harus 3–32 karakter huruf, angka, - atau _"),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().int().min(1).max(2_147_483_647),
  minSpend: rupiah,
  maxDiscount: rupiah.nullable(),
  startsAt: z.string().datetime({ offset: true }).nullable().default(null),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  usageLimit: z.number().int().positive().max(1_000_000).nullable().default(null),
  perUserLimit: z.number().int().positive().max(1_000_000).nullable().default(null),
  isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.discountType === "PERCENT" && v.discountValue > 100)
    ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Persentase tidak boleh melebihi 100%" });
  if (v.maxDiscount === 0) ctx.addIssue({ code: "custom", path: ["maxDiscount"], message: "Batas diskon harus lebih dari Rp0" });
  if (v.startsAt && v.expiresAt && Date.parse(v.startsAt) >= Date.parse(v.expiresAt))
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Tanggal berakhir harus setelah tanggal mulai" });
  if (v.expiresAt && v.isActive && new Date(v.expiresAt).getTime() <= Date.now())
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Tanggal berakhir harus di masa depan untuk voucher aktif" });
});
export type VoucherInput = z.infer<typeof voucherInputSchema>;
