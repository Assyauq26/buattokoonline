import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const table = z.object({
  unit: z.enum(["cm", "inch"]).nullable().default("cm"),
  columns: z.array(z.object({ id, label: z.string().trim().min(1).max(60) }).strict()).min(1).max(10),
  rows: z.array(z.object({ id, cells: z.record(id, z.string().trim().max(80)) }).strict()).min(1).max(50),
}).strict().superRefine((value, ctx) => {
  const columns = new Set(value.columns.map(c => c.id));
  if (columns.size !== value.columns.length || new Set(value.rows.map(r => r.id)).size !== value.rows.length)
    ctx.addIssue({ code: "custom", message: "ID baris dan kolom ukuran harus unik." });
  if (value.rows.some(row => Object.keys(row.cells).length !== columns.size || Object.keys(row.cells).some(key => !columns.has(key)) || value.columns.some(c => !row.cells[c.id])))
    ctx.addIssue({ code: "custom", message: "Lengkapi setiap sel tabel ukuran." });
});
export const sizeChartSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("image"), imageId: id }).strict(),
  z.object({ mode: z.literal("table"), table }).strict(),
]).superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 90000)
    ctx.addIssue({ code: "custom", message: "Data tabel ukuran terlalu besar (maksimal 90 KB)." });
});
export type SizeChart = z.infer<typeof sizeChartSchema>;
export function readSizeChart(value: unknown): SizeChart | null {
  const parsed = sizeChartSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function defaultSizeChart(): SizeChart & { mode: "table" } {
  return { mode: "table", table: { unit: "cm", columns: [
    { id: "size", label: "Ukuran" }, { id: "width", label: "LD" }, { id: "length", label: "PB" },
  ], rows: [
    { id: "m", cells: { size: "M", width: "50", length: "68" } },
    { id: "l", cells: { size: "L", width: "52", length: "70" } },
    { id: "xl", cells: { size: "XL", width: "54", length: "72" } },
  ] } };
}
