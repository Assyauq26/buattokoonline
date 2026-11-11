import { sizeChartSchema } from "./product-size-chart";
import { z } from "zod";
import {
  shippingMetadataSchema,
  shippingMetadataShape,
} from "./product-shipping";
import {
  canonicalOption,
  combinationKey,
  combinationCount,
} from "./variation-domain";
const optionId = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]{1,64}$/,
    "Pilihan variasi tidak valid. Muat ulang editor.",
  );
const optionGroups = z
  .array(
    z.object({
      id: optionId,
      name: z
        .string()
        .trim()
        .min(1, "Isi nama jenis variasi.")
        .max(80, "Nama variasi maksimal 80 karakter."),
      allowsImage: z.boolean().default(false),
      values: z
        .array(
          z.object({
            id: optionId,
            value: z
              .string()
              .trim()
              .min(1, "Isi nama opsi variasi.")
              .max(80, "Nama opsi maksimal 80 karakter."),
            imageId: z.string().max(64).nullable().optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
  )
  .max(3);

const money = z
  .number({ error: "Isi harga dengan angka yang valid." })
  .int("Harga harus berupa rupiah bulat.")
  .min(1, "Harga minimal Rp1.")
  .max(2_147_483_647, "Harga melebihi batas yang didukung.");
const optionalMoney = money.nullable().optional();
const slug = z
  .string()
  .trim()
  .min(1, "Isi alamat produk.")
  .max(120, "Alamat produk maksimal 120 karakter.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug hanya huruf kecil, angka, dan tanda hubung",
  );
const variant = z
  .object({
    id: z.string().min(1).max(64).optional(),
    sku: z
      .string()
      .trim()
      .min(1, "SKU belum tersedia. Buat SKU otomatis atau isi kode SKU.")
      .max(80, "SKU maksimal 80 karakter."),
    color: z.string().trim().max(80).optional().default(""),
    size: z.string().trim().max(40).optional().default(""),
    price: optionalMoney,
    salePrice: optionalMoney,
    optionValueIds: z.array(optionId).max(3).optional(),
    onHand: z
      .number({ error: "Isi stok dengan angka yang valid." })
      .int("Stok harus berupa bilangan bulat.")
      .min(0, "Stok tidak boleh negatif.")
      .max(2_147_483_647, "Stok melebihi batas yang didukung.")
      .optional(),
    expectedOnHand: z.number().int().min(0).optional(),
  })
  .refine(
    (v) => v.salePrice == null || (v.price != null && v.salePrice < v.price),
    {
      message: "Harga diskon harus lebih rendah daripada harga normal SKU.",
      path: ["salePrice"],
    },
  );

const productObjectSchema = z
  .object({
    ...shippingMetadataShape,
    name: z
      .string()
      .trim()
      .min(2, "Nama produk minimal 2 karakter")
      .max(160, "Nama produk maksimal 160 karakter."),
    slug,
    description: z.string().trim().max(10_000).default(""),
    material: z.string().trim().max(2_000).default(""),
    careInstruction: z.string().trim().max(2_000).default(""),
    sizeChart: sizeChartSchema.nullable().optional(),
    shippingReturn: z.string().trim().max(2_000).default(""),
    basePrice: money,
    salePrice: optionalMoney,
    categoryId: z.string().max(64).nullable().optional(),
    brandId: z.string().max(64).nullable().optional(),
    isFeatured: z.boolean().default(false),

    optionsEnabled: z.boolean().optional(),
    variantMode: z.enum(["simple", "variable"]).optional(),
    optionGroups: optionGroups.optional(),
    optionImages: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          alt: z.string().trim().max(200).default(""),
        }),
      )
      .max(50)
      .optional(),
    variants: z
      .array(variant)
      .min(1, "Buat minimal satu SKU untuk produk.")
      .max(50, "Maksimal 50 kombinasi SKU per produk."),
    images: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          alt: z.string().trim().max(200).default(""),
        }),
      )
      .max(10)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (
      v.variantMode === "simple" &&
      (v.optionsEnabled ||
        v.optionGroups?.length ||
        v.variants.length !== 1 ||
        v.variants.some(
          (row) => row.color || row.size || row.optionValueIds?.length,
        ))
    )
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message:
          "Produk tanpa variasi harus memiliki tepat satu SKU tanpa pilihan variasi.",
      });
    if (v.variantMode === "variable" && v.optionsEnabled !== true)
      ctx.addIssue({
        code: "custom",
        path: ["optionGroups"],
        message: "Aktifkan dan lengkapi variasi produk sebelum menyimpan.",
      });
    const shipping = shippingMetadataSchema.safeParse(v);
    if (!shipping.success)
      for (const issue of shipping.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
    if (v.salePrice != null && v.salePrice >= v.basePrice)
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "Harga diskon harus lebih kecil dari harga normal",
      });
    if (v.optionsEnabled === true && !v.optionGroups?.length)
      ctx.addIssue({
        code: "custom",
        path: ["optionGroups"],
        message: "Mode variasi kustom memerlukan minimal satu jenis variasi",
      });
    if (v.optionGroups?.length && v.optionsEnabled !== false) {
      const groups = v.optionGroups;
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path: ["optionGroups"], message });
      if (
        new Set(groups.map((g) => g.id)).size !== groups.length ||
        new Set(groups.map((g) => canonicalOption(g.name))).size !==
          groups.length
      )
        issue("Nama atau ID variasi tidak boleh duplikat");
      if (groups.filter((g) => g.allowsImage).length > 1)
        issue("Foto variasi hanya dapat digunakan pada satu jenis variasi.");
      const ids = groups.flatMap((g) => g.values.map((x) => x.id));
      if (new Set(ids).size !== ids.length)
        issue("ID opsi tidak boleh duplikat");
      for (const group of groups) {
        if (
          new Set(group.values.map((x) => canonicalOption(x.value))).size !==
          group.values.length
        )
          issue("Nilai opsi tidak boleh duplikat");
        if (!group.allowsImage && group.values.some((x) => x.imageId))
          issue("Foto hanya boleh dipasang pada variasi dengan gambar aktif");
      }
      if (combinationCount(groups) > 50)
        issue(
          "Jumlah kombinasi melebihi batas maksimum 50 SKU. Kurangi beberapa opsi untuk melanjutkan.",
        );
      for (const row of v.variants) {
        const selected = row.optionValueIds ?? [];
        if (
          selected.length !== groups.length ||
          groups.some(
            (g) => g.values.filter((x) => selected.includes(x.id)).length !== 1,
          )
        )
          issue("Setiap SKU harus memilih tepat satu opsi dari setiap variasi");
      }
      if (
        new Set(
          v.variants.map((row) => combinationKey(row.optionValueIds ?? [])),
        ).size !== v.variants.length
      )
        issue("Kombinasi SKU tidak boleh duplikat");
    }
    const seenSku = new Set<string>();
    v.variants.forEach((row, index) => {
      const sku = row.sku.toUpperCase();
      if (seenSku.has(sku))
        ctx.addIssue({
          code: "custom",
          path: ["variants", index, "sku"],
          message: "SKU ini sudah digunakan pada kombinasi lain.",
        });
      seenSku.add(sku);
    });
    for (const [key, values] of [
      ["ID varian", v.variants.flatMap((x) => (x.id ? [x.id] : []))],
      ["ID gambar", [...v.images, ...(v.optionImages ?? [])].map((x) => x.id)],
    ] as const) {
      if (new Set(values).size !== values.length)
        ctx.addIssue({
          code: "custom",
          message: `${key} tidak boleh duplikat`,
        });
    }
  });
/** Reject promotion fields even inside variant/import-shaped payloads; never silently strip them. */
export function hasFlashSaleMutation(value: unknown): boolean {
  const pending = [value];
  const seen = new WeakSet<object>();
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    if (++visited > 10000) return true;
    seen.add(current);
    for (const [key, child] of Object.entries(current)) {
      if (/^(isFlashSale|flashSale|campaign)/i.test(key)) return true;
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return false;
}
export const productInputSchema = z.preprocess((value, ctx) => {
  if (hasFlashSaleMutation(value)) {
    ctx.addIssue({
      code: "custom",
      message: "Pengaturan Flash Sale hanya melalui Marketing.",
    });
    return z.NEVER;
  }
  return value;
}, productObjectSchema);
export type ProductInput = z.infer<typeof productInputSchema>;
export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  parentId: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
export type CatalogActor = {
  id: string;
  permissions: string[];
  isAdmin: boolean;
};
