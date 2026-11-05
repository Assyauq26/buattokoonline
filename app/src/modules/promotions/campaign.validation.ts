import { z } from "zod";
export const campaignInputSchema = z
  .object({
    id: z.string().uuid().nullable(),
    expectedVersion: z.number().int().min(0),
    name: z.string().trim().min(2).max(120),
    status: z.enum(["DRAFT", "SCHEDULED"]),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    resolveLegacy: z.boolean().default(false),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(64),
            flashSalePrice: z.number().int().positive().max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (Date.parse(v.startsAt) >= Date.parse(v.endsAt))
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Waktu berakhir harus setelah mulai.",
      });
    if (new Set(v.items.map((i) => i.productId)).size !== v.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Produk peserta tidak boleh duplikat.",
      });
    if (v.resolveLegacy && v.status !== "SCHEDULED")
      ctx.addIssue({
        code: "custom",
        message: "Konversi promo lama memerlukan jadwal yang disetujui.",
      });
  });
export type CampaignInput = z.infer<typeof campaignInputSchema>;
export const campaignProductQuerySchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    categoryId: z.string().min(1).max(64).optional(),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type CampaignClock = {
  id: string;
  name: string;
  status: string;
  version: number;
  startsAt: string;
  endsAt: string;
  serverNow: number;
};
export function campaignState(
  c: Pick<CampaignClock, "status" | "startsAt" | "endsAt">,
  now: number,
) {
  if (c.status === "CANCELLED" || c.status === "DRAFT") return c.status;
  if (c.status === "ENDED" || now >= Date.parse(c.endsAt)) return "ENDED";
  return now < Date.parse(c.startsAt) ? "UPCOMING" : "ACTIVE";
}
/** Jakarta has a fixed UTC+07 offset; never depend on the operator's browser timezone. */
export function wibInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new Error("Tanggal WIB tidak valid.");
  const result = new Date(
    value + (value.length === 16 ? ":00" : "") + "+07:00",
  );
  if (
    !Number.isFinite(result.getTime()) ||
    new Date(result.getTime() + 7 * 3600000)
      .toISOString()
      .slice(0, value.length) !== value
  )
    throw new Error("Tanggal WIB tidak valid.");
  return result.toISOString();
}
export const isoToWibInput = (value: string) =>
  new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 19);
