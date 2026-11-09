import { assertCampaignProductEdit } from "@/modules/promotions/campaign.service";
import { canonicalProductPricing } from "./product-canonical-pricing";
import { readSizeChart } from "./product-size-chart";
import { assertPublishWeight } from "./product-shipping";
import {
  finalizeStagedMedia,
  readSaveReceipt,
  writeSaveReceipt,
  savePayloadHash,
  type MediaContext,
} from "./staged-product-media";
import { combinationKey } from "./variation-domain";
import {
  legacyOptions,
  legacySelection,
  writeOptionGroups,
  writeVariantSelection,
  finishOptions,
  assertStableSelection,
} from "./variation-persistence";
import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { removeObject, STORAGE_APP } from "@/lib/storage";
import { adjustStock } from "@/modules/inventory/inventory.service";
import {
  categoryInputSchema,
  hasFlashSaleMutation,
  productInputSchema,
  type CatalogActor,
} from "./product-management.validation";

export function assertCatalogPermission(
  actor: CatalogActor,
  permission: PermissionKey,
) {
  if (!actor.isAdmin || !actor.permissions.includes(permission))
    throw new HttpError("Anda tidak memiliki izin untuk operasi ini", 403);
}
const include = {
  optionGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: { values: { orderBy: { sortOrder: "asc" as const } } },
  },
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: {
      optionValues: true,
      inventory: true,
      _count: {
        select: { orderItems: true, cartItems: true, movements: true },
      },
    },
  },
} satisfies Prisma.ProductInclude;
type ManagedProduct = Prisma.ProductGetPayload<{ include: typeof include }>;

async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15_000,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2034" && attempt < 2) continue;
        if (err.code === "P2002")
          throw new HttpError(
            "Slug atau SKU sudah digunakan. Pilih nilai lain.",
            409,
          );
        if (["P2003", "P2004"].includes(err.code))
          throw new HttpError(
            "Relasi variasi atau gambar tidak konsisten. Periksa perubahan sebelum menyimpan.",
            409,
          );
        if (err.code === "P2034")
          throw new HttpError(
            "Data sedang diubah. Muat ulang dan coba lagi.",
            409,
          );
      }
      throw err;
    }
  }
}
async function lockProduct(
  tx: Prisma.TransactionClient,
  id: string,
  expected: string,
) {
  const p = await tx.product.findUnique({ where: { id }, include });
  if (!p) throw new HttpError("Produk tidak ditemukan", 404);
  if (p.updatedAt.toISOString() !== expected)
    throw new HttpError(
      "Produk sudah berubah. Muat ulang sebelum menyimpan.",
      409,
    );
  const updatedAt = new Date(Math.max(Date.now(), p.updatedAt.getTime() + 1));
  const result = await tx.product.updateMany({
    where: { id, updatedAt: p.updatedAt },
    data: { updatedAt },
  });
  if (result.count !== 1)
    throw new HttpError(
      "Produk sudah berubah. Muat ulang sebelum menyimpan.",
      409,
    );
  return { p, updatedAt };
}
function parseProduct(value: unknown) {
  if (hasFlashSaleMutation(value))
    throw new HttpError("Pengaturan Flash Sale hanya dapat diubah melalui Marketing.",422);
  if (value && typeof value === "object" && "variants" in value && Array.isArray(value.variants) && value.variants.every(v => v && typeof v === "object") && "basePrice" in value) {
    value = canonicalProductPricing(value as Parameters<typeof canonicalProductPricing>[0]);
  }
  const parsed = productInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  if (parsed.data.optionsEnabled === false)
    parsed.data.optionGroups = undefined;
  return parsed.data;
}
async function validateRelations(
  tx: Prisma.TransactionClient,
  categoryId?: string | null,
  brandId?: string | null,
) {
  if (
    categoryId &&
    !(await tx.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    }))
  )
    throw new HttpError("Kategori tidak ditemukan", 422);
  if (
    brandId &&
    !(await tx.brand.findUnique({
      where: { id: brandId },
      select: { id: true },
    }))
  )
    throw new HttpError("Brand tidak ditemukan", 422);
}
function fields(input: ReturnType<typeof parseProduct>) {
  const {
    variants: _variants,
    images: _images,
    optionGroups: _groups,
    optionImages: _optionImages,
    optionsEnabled: _mode,
    sizeChart,
    ...data
  } = input;
  return {
    ...data,
    ...(sizeChart !== undefined ? { sizeChart: sizeChart === null ? Prisma.DbNull : sizeChart as Prisma.InputJsonValue } : {}),
    salePrice: data.salePrice ?? null,
    categoryId: data.categoryId || null,
    brandId: data.brandId || null,
  };
}
function assertSizeChartImage(input: ReturnType<typeof parseProduct>, imageIds: string[]) {
  if (input.sizeChart?.mode === "image" && !imageIds.includes(input.sizeChart.imageId))
    throw new HttpError("Foto tabel ukuran harus milik produk ini dan disertakan dalam penyimpanan.", 422);
}
function requireStockEdit(actor: CatalogActor) {
  assertCatalogPermission(actor, PERMISSIONS.INVENTORY_READ);
  assertCatalogPermission(actor, PERMISSIONS.INVENTORY_ADJUST);
}

type WriteResult = {
  id: string;
  updatedAt: string;
  status: ProductStatus;
  previousSlug?: string;
  removedImages?: { id: string; url: string }[];
};

export async function createManagedProduct(
  actor: CatalogActor,
  value: unknown,
  ctx?: MediaContext,
) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_CREATE);
  const input = parseProduct(value);
  if (
    (!ctx && (input.images.length || input.optionImages?.length)) ||
    input.variants.some((v) => v.id)
  )
    throw new HttpError(
      "Produk baru tidak boleh memakai ID varian atau gambar existing",
      422,
    );
  if (input.variants.some((v) => (v.onHand ?? 0) !== 0))
    requireStockEdit(actor);
  const payloadHash = savePayloadHash({ operation: "create", input });
  return transaction(async (tx) => {
    const receipt = await readSaveReceipt(tx, actor, ctx, payloadHash);
    if (receipt) return receipt as WriteResult;
    await validateRelations(tx, input.categoryId, input.brandId);
    const p = await tx.product.create({
      data: { ...fields(input), status: "DRAFT" },
    });
    const stagedImages = await finalizeStagedMedia(
      tx,
      actor,
      ctx?.sessionHash,
      p.id,
      input.images,
      input.optionImages ?? [],
    );
    if (
      stagedImages.length !==
      input.images.length + (input.optionImages?.length ?? 0)
    )
      throw new HttpError(
        "Produk baru hanya dapat memakai foto sementara milik sesi ini",
        422,
      );
    assertSizeChartImage(input, stagedImages.map(i => i.id));
    if (input.optionGroups)
      await writeOptionGroups(
        tx,
        p.id,
        input,
        stagedImages.map((i) => i.id),
      );
    for (const v of input.variants) {
      const row = await tx.productVariant.create({
        data: {
          productId: p.id,
          combinationKey: input.optionGroups?.length
            ? combinationKey(v.optionValueIds!)
            : null,
          sku: v.sku,
          color: v.color || null,
          size: v.size || null,
          price: v.price ?? null,
          salePrice: v.salePrice ?? null,
          inventory: { create: { onHand: 0 } },
        },
      });
      if (input.optionGroups?.length)
        await writeVariantSelection(
          tx,
          p.id,
          row.id,
          input.optionGroups,
          v.optionValueIds!,
        );
      if (v.onHand)
        await adjustStock(row.id, v.onHand, "Stok awal produk", {
          tx,
          expectedOnHand: 0,
          reference: p.id,
        });
    }
    if (input.optionGroups)
      await finishOptions(tx, p.id, input.optionGroups, p.updatedAt);
    else
      await tx.$queryRaw`SELECT store_backfill_legacy_options(${p.id}::text)::text`;
    await writeAudit(
      {
        userId: actor.id,
        action: "product.create",
        entity: "Product",
        entityId: p.id,
      },
      tx,
    );
    const result = {
      id: p.id,
      updatedAt: p.updatedAt.toISOString(),
      status: p.status,
    };
    await writeSaveReceipt(tx, actor, ctx, payloadHash, result);
    return result;
  });
}

export async function updateManagedProduct(
  actor: CatalogActor,
  id: string,
  expected: string,
  value: unknown,
  ctx?: MediaContext,
) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_UPDATE);
  const input = parseProduct(value);
  const payloadHash = savePayloadHash({
    operation: "update",
    id,
    expected,
    input,
  });
  const result = await transaction(async (tx) => {
    const receipt = await readSaveReceipt(tx, actor, ctx, payloadHash);
    if (receipt) return receipt as WriteResult;
    const { p, updatedAt } = await lockProduct(tx, id, expected);
    await assertCampaignProductEdit(tx,id,input);
    const shippingKeys = [
      "weightGrams",
      "packageLengthMm",
      "packageWidthMm",
      "packageHeightMm",
    ] as const;
    const shippingChanged = shippingKeys.some(
      (key) => input[key] !== undefined && input[key] !== p[key],
    );
    if (
      p.status === "PUBLISHED" &&
      shippingChanged &&
      (input.weightGrams === undefined ? p.weightGrams : input.weightGrams) ==
        null
    )
      throw new HttpError(
        "Isi berat paket ketika memperbarui pengiriman produk terbit.",
        422,
      );

    const finalized = await finalizeStagedMedia(
      tx,
      actor,
      ctx?.sessionHash,
      id,
      input.images,
      input.optionImages ?? [],
    );
    p.images.push(...finalized);
    if (p.optionsEnabled && !input.optionGroups?.length)
      throw new HttpError(
        "Produk memakai variasi kustom. Gunakan editor yang mendukung pilihan SKU.",
        409,
      );
    const keptOptionImages =
      input.optionImages ??
      p.images
        .filter((i) => i.isVariation)
        .map((i) => ({ id: i.id, alt: i.alt }));
    const allImages = [...input.images, ...keptOptionImages];
    assertSizeChartImage({ ...input, sizeChart: input.sizeChart === undefined ? readSizeChart(p.sizeChart) : input.sizeChart }, allImages.map(i => i.id));
    for (const image of input.images)
      if (!p.images.some((i) => i.id === image.id && !i.isVariation))
        throw new HttpError("Gambar galeri bukan milik produk ini", 422);
    for (const image of keptOptionImages)
      if (!p.images.some((i) => i.id === image.id && i.isVariation))
        throw new HttpError("Gambar opsi bukan milik produk ini", 422);
    if (input.optionGroups)
      for (const v of input.variants) {
        const old = p.variants.find((row) => row.id === v.id);
        if (old)
          assertStableSelection(
            id,
            p.optionsEnabled,
            old,
            v.optionValueIds ?? [],
          );
      }
    if (
      p.flashSalePrice != null &&
      (input.salePrice != null ||
        input.basePrice <= p.flashSalePrice ||
        input.variants.some((v) => v.price != null || v.salePrice != null))
    )
      throw new HttpError(
        "Produk memiliki jadwal flash sale. Hapus jadwal melalui Marketing sebelum mengubah harga.",
        409,
      );
    await validateRelations(tx, input.categoryId, input.brandId);
    for (const v of input.variants)
      if (v.id && !p.variants.some((row) => row.id === v.id))
        throw new HttpError("Varian bukan milik produk ini", 422);
    for (const image of allImages)
      if (!p.images.some((row) => row.id === image.id))
        throw new HttpError("Gambar bukan milik produk ini", 422);
    if (p.status === "PUBLISHED" && input.images.length === 0)
      throw new HttpError(
        "Produk terbit harus memiliki gambar. Ubah menjadi draft sebelum menghapus semua gambar.",
        422,
      );
    for (const old of p.variants.filter(
      (row) => !input.variants.some((v) => v.id === row.id),
    )) {
      if (
        old._count.orderItems ||
        old._count.cartItems ||
        old._count.movements ||
        old.inventory?.reserved ||
        old.inventory?.onHand
      )
        throw new HttpError(
          "Varian memiliki stok atau riwayat transaksi; pertahankan varian tersebut",
          409,
        );
      await tx.inventory.deleteMany({ where: { variantId: old.id } });
      await tx.productVariant.delete({ where: { id: old.id } });
    }
    if (input.optionGroups)
      await writeOptionGroups(
        tx,
        id,
        input,
        allImages.map((i) => i.id),
      );
    for (const v of input.variants) {
      const old = p.variants.find((row) => row.id === v.id);
      if (!old) {
        if (v.onHand) requireStockEdit(actor);
        const row = await tx.productVariant.create({
          data: {
            productId: id,
            combinationKey: input.optionGroups?.length
              ? combinationKey(v.optionValueIds!)
              : null,
            sku: v.sku,
            color: v.color || null,
            size: v.size || null,
            price: v.price ?? null,
            salePrice: v.salePrice ?? null,
            inventory: { create: { onHand: 0 } },
          },
        });
        if (input.optionGroups?.length)
          await writeVariantSelection(
            tx,
            id,
            row.id,
            input.optionGroups,
            v.optionValueIds!,
          );
        if (v.onHand)
          await adjustStock(row.id, v.onHand, "Stok awal varian", {
            tx,
            expectedOnHand: 0,
            reference: id,
          });
      } else {
        await tx.productVariant.update({
          where: { id: old.id },
          data: {
            combinationKey: input.optionGroups?.length
              ? combinationKey(v.optionValueIds!)
              : null,
            sku: v.sku,
            color: v.color || null,
            size: v.size || null,
            price: v.price ?? null,
            salePrice: v.salePrice ?? null,
          },
        });
        if (input.optionGroups?.length)
          await writeVariantSelection(
            tx,
            id,
            old.id,
            input.optionGroups,
            v.optionValueIds!,
          );
        if (
          v.onHand !== undefined &&
          v.onHand !== (old.inventory?.onHand ?? 0)
        ) {
          requireStockEdit(actor);
          if (v.expectedOnHand === undefined)
            throw new HttpError(
              "Muat ulang data stok sebelum melakukan adjustment",
              409,
            );
          await adjustStock(old.id, v.onHand, "Adjustment Product Management", {
            tx,
            expectedOnHand: v.expectedOnHand,
            reference: id,
          });
        }
      }
    }
    if (input.optionGroups)
      await finishOptions(tx, id, input.optionGroups, updatedAt);
    else
      await tx.$queryRaw`SELECT store_backfill_legacy_options(${id}::text)::text`;
    for (const old of p.images.filter(
      (image) => !allImages.some((i) => i.id === image.id),
    )) {
      if (await tx.orderItem.count({ where: { imageUrl: old.url } }))
        throw new HttpError(
          "Gambar dipakai riwayat pesanan dan tidak boleh dihapus",
          409,
        );
      if (await tx.productOptionValue.count({ where: { imageId: old.id } }))
        throw new HttpError("Gambar masih dipakai opsi variasi", 409);
      await tx.productImage.delete({ where: { id: old.id } });
    }
    for (const [index, image] of allImages.entries())
      await tx.productImage.update({
        where: { id: image.id },
        data: { alt: image.alt, sortOrder: index },
      });
    await tx.product.update({
      where: { id },
      data: { ...fields(input), updatedAt },
    });
    await writeAudit(
      {
        userId: actor.id,
        action: "product.update",
        entity: "Product",
        entityId: id,
      },
      tx,
    );
    const result = {
      id,
      updatedAt: updatedAt.toISOString(),
      status: p.status,
      previousSlug: p.slug,
      removedImages: p.images
        .filter((image) => !allImages.some((row) => row.id === image.id))
        .map((image) => ({ id: image.id, url: image.url })),
    };
    await writeSaveReceipt(tx, actor, ctx, payloadHash, result);
    return result;
  });
  // Delete objects only after the DB transaction commits. Never delete order-history images.
  // Legacy external URLs remain untouched. A failed cleanup is reported but never undoes the valid edit.
  for (const image of result.removedImages ?? []) {
    try {
      const url = new URL(image.url, "http://localhost");
      if (
        url.origin !== "http://localhost" ||
        url.pathname !== `/api/v1/product-images/${image.id}`
      )
        continue;
      const objectPath = url.searchParams.get("object") || "";
      if (
        !objectPath.startsWith(
          `${STORAGE_APP}/product-images/${id}/${image.id}.`,
        ) &&
        !objectPath.startsWith(
          `${STORAGE_APP}/product-images/staged-${image.id}/${image.id}.`,
        )
      )
        continue;
      await removeObject(objectPath);
    } catch {
      console.error("[storage] Detached product image cleanup failed");
    }
  }
  return result;
}

export async function changeProductStatus(
  actor: CatalogActor,
  id: string,
  expected: string,
  status: ProductStatus,
) {
  assertCatalogPermission(
    actor,
    status === "ARCHIVED"
      ? PERMISSIONS.PRODUCT_DELETE
      : PERMISSIONS.PRODUCT_UPDATE,
  );
  if (!Object.values(ProductStatus).includes(status))
    throw new HttpError("Status produk tidak valid", 422);
  return transaction(async (tx) => {
    const { p, updatedAt } = await lockProduct(tx, id, expected);
    if (
      status === "PUBLISHED" &&
      (!p.images.some((i) => !i.isVariation) || !p.variants.length)
    )
      throw new HttpError(
        "Tambahkan gambar dan varian sebelum menerbitkan produk",
        422,
      );
    if (status === "PUBLISHED") {
      parseProduct(serializeProduct(p, actor));
      if (p.status !== "PUBLISHED") {
        try {
          assertPublishWeight(p.weightGrams);
        } catch {
          throw new HttpError(
            "Isi berat paket sebelum menerbitkan produk.",
            422,
          );
        }
      }
    }
    await tx.product.update({ where: { id }, data: { status, updatedAt } });
    await writeAudit(
      {
        userId: actor.id,
        action: `product.${status.toLowerCase()}`,
        entity: "Product",
        entityId: id,
        meta: { from: p.status, to: status },
      },
      tx,
    );
    return { id, updatedAt: updatedAt.toISOString(), status };
  });
}

export async function getManagedProduct(actor: CatalogActor, id: string) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_READ);
  const p = await prisma.product.findUnique({ where: { id }, include });
  if (!p) throw new HttpError("Produk tidak ditemukan", 404);
  return serializeProduct(p, actor);
}
function serializeProduct(p: ManagedProduct, actor: CatalogActor) {
  const stock = actor.permissions.includes(PERMISSIONS.INVENTORY_READ);
  const optionGroups = p.optionsEnabled
    ? p.optionGroups.map((g) => ({
        id: g.id,
        name: g.name,
        allowsImage: g.allowsImage,
        values: g.values.map((v) => ({
          id: v.id,
          value: v.value,
          imageId: v.imageId,
        })),
      }))
    : legacyOptions(p.id, p.variants);
  return {
    weightGrams: p.weightGrams,
    packageLengthMm: p.packageLengthMm,
    packageWidthMm: p.packageWidthMm,
    packageHeightMm: p.packageHeightMm,
    optionsEnabled: p.optionsEnabled,
    optionGroups,
    optionImages: p.images
      .filter((i) => i.isVariation)
      .map(({ id, url, alt }) => ({ id, url, alt })),
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    material: p.material,
    careInstruction: p.careInstruction,
    sizeChart: readSizeChart(p.sizeChart),
    shippingReturn: p.shippingReturn,
    basePrice: p.basePrice,
    salePrice: p.salePrice,
    categoryId: p.categoryId,
    brandId: p.brandId,
    isFeatured: p.isFeatured,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
    images: p.images
      .filter((i) => !i.isVariation)
      .map(({ id, url, alt }) => ({ id, url, alt })),
    variants: p.variants.map((v) => ({
      protected: Boolean(
        v.inventory?.onHand ||
          v.inventory?.reserved ||
          v._count.orderItems ||
          v._count.cartItems ||
          v._count.movements,
      ),
      optionValueIds: p.optionsEnabled
        ? v.optionValues.map((s) => s.valueId)
        : legacySelection(p.id, v),
      id: v.id,
      sku: v.sku,
      color: v.color ?? "",
      size: v.size ?? "",
      price: v.price,
      salePrice: v.salePrice,
      ...(stock
        ? {
            onHand: v.inventory?.onHand ?? 0,
            expectedOnHand: v.inventory?.onHand ?? 0,
            reserved: v.inventory?.reserved ?? 0,
          }
        : {}),
    })),
  };
}
export type ProductEditorData = Awaited<ReturnType<typeof getManagedProduct>>;

export async function getProductEditorOptions(actor: CatalogActor) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_READ);
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { categories, brands };
}

export async function listManagedProducts(
  actor: CatalogActor,
  q = "",
  status?: ProductStatus,
  page = 1,
  categoryId?: string,
) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_READ);
  const where: Prisma.ProductWhereInput = {
    ...(q.trim()
      ? {
          OR: [
            { name: { contains: q.trim().slice(0, 100), mode: "insensitive" } },
            { slug: { contains: q.trim().slice(0, 100), mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  page = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100_000) : 1;
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        basePrice: true,
        salePrice: true,
        updatedAt: true,
        variants: { select: { inventory: { select: { onHand: true, reserved: true } } } },
        category: { select: { name: true } },
        images: {
          where: { isVariation: false },
          select: { url: true, alt: true },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
        _count: { select: { variants: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total, page, pages: Math.ceil(total / 20) };
}

export async function saveCategory(
  actor: CatalogActor,
  id: string | null,
  value: unknown,
) {
  assertCatalogPermission(
    actor,
    id ? PERMISSIONS.PRODUCT_UPDATE : PERMISSIONS.PRODUCT_CREATE,
  );
  const parsed = categoryInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const data = { ...parsed.data, parentId: parsed.data.parentId || null };
  return transaction(async (tx) => {
    const categories = await tx.category.findMany({
      select: { id: true, parentId: true },
    });
    if (id && !categories.some((c) => c.id === id))
      throw new HttpError("Kategori tidak ditemukan", 404);
    const visited = new Set<string>(id ? [id] : []);
    let parent = data.parentId;
    while (parent) {
      if (visited.has(parent))
        throw new HttpError(
          "Hierarki kategori tidak boleh membentuk siklus",
          422,
        );
      visited.add(parent);
      const c = categories.find((row) => row.id === parent);
      if (!c) throw new HttpError("Kategori induk tidak ditemukan", 422);
      parent = c.parentId;
    }
    const row = id
      ? await tx.category.update({ where: { id }, data })
      : await tx.category.create({ data });
    await writeAudit(
      {
        userId: actor.id,
        action: id ? "category.update" : "category.create",
        entity: "Category",
        entityId: row.id,
      },
      tx,
    );
    return { id: row.id };
  });
}

export async function attachProductImage(
  actor: CatalogActor,
  productId: string,
  expected: string,
  image: { id: string; url: string; alt: string; isVariation?: boolean },
) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_UPDATE);
  return transaction(async (tx) => {
    const { p, updatedAt } = await lockProduct(tx, productId, expected);
    if (
      p.images.filter((i) => i.isVariation === Boolean(image.isVariation))
        .length >= (image.isVariation ? 50 : 10)
    )
      throw new HttpError("Batas foto produk tercapai", 422);
    const row = await tx.productImage.create({
      data: { ...image, productId, sortOrder: p.images.length },
    });
    await writeAudit(
      {
        userId: actor.id,
        action: "product.image.upload",
        entity: "Product",
        entityId: productId,
      },
      tx,
    );
    return {
      image: { id: row.id, url: row.url, alt: row.alt },
      updatedAt: updatedAt.toISOString(),
    };
  });
}
