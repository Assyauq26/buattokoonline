"use server";

import { productEditorSessionHash } from "./product-editor-session";
import { revalidatePath, revalidateTag } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { HttpError } from "@/lib/response";
import { CATALOG_CACHE_TAG } from "./catalog-cache";
import {
  createManagedProduct,
  updateManagedProduct,
  changeProductStatus,
  getManagedProduct,
  saveCategory,
} from "./product-management.service";
import type { ProductStatus } from "@prisma/client";

function refreshCatalog() {
  revalidateTag(CATALOG_CACHE_TAG);
  for (const path of [
    "/admin",
    "/admin/products",
    "/admin/categories",
    "/",
    "/shop",
    "/search",
  ])
    revalidatePath(path);
  for (const path of ["/product/[slug]", "/category/[slug]", "/brand/[slug]"])
    revalidatePath(path, "page");
}
export async function saveProductAction(form: FormData) {
  return runAction(async () => {
    const id = String(form.get("id") || "");
    const actor = await requirePermission(
      id ? PERMISSIONS.PRODUCT_UPDATE : PERMISSIONS.PRODUCT_CREATE,
    );
    if (!actor.permissions.includes(PERMISSIONS.PRODUCT_READ))
      throw new HttpError("Izin membaca produk diperlukan", 403);
    let value: unknown;
    try {
      value = JSON.parse(String(form.get("product") || ""));
    } catch {
      throw new HttpError("Data produk tidak valid", 422);
    }
    const ctx = {
      sessionHash: await productEditorSessionHash(),
      requestId: String(form.get("requestId") || ""),
    };
    const result = id
      ? await updateManagedProduct(
          actor,
          id,
          String(form.get("updatedAt") || ""),
          value,
          ctx,
        )
      : await createManagedProduct(actor, value, ctx);
    refreshCatalog();
    return getManagedProduct(actor, result.id);
  });
}
export async function setProductStatusAction(
  id: string,
  updatedAt: string,
  status: ProductStatus,
) {
  return runAction(async () => {
    const actor = await requirePermission(
      status === "ARCHIVED"
        ? PERMISSIONS.PRODUCT_DELETE
        : PERMISSIONS.PRODUCT_UPDATE,
    );
    if (!actor.permissions.includes(PERMISSIONS.PRODUCT_READ))
      throw new HttpError("Izin membaca produk diperlukan", 403);
    await changeProductStatus(actor, id, updatedAt, status);
    refreshCatalog();
    return getManagedProduct(actor, id);
  });
}
export async function saveCategoryAction(id: string | null, value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(
      id ? PERMISSIONS.PRODUCT_UPDATE : PERMISSIONS.PRODUCT_CREATE,
    );
    const result = await saveCategory(actor, id, value);
    refreshCatalog();
    return result;
  });
}

/** Read-only reconciliation; never advances a client revision without checking the snapshot. */
export async function readProductEditorAction(id: string) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    return getManagedProduct(actor, id);
  });
}

/** Explicit generation click only; no database work while typing. SKU is still unique at save. */
export async function allocateProductSkusAction(
  candidates: { key: string; sku: string }[],
) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    if (
      !actor.isAdmin ||
      !actor.permissions.some(
        (p) =>
          p === PERMISSIONS.PRODUCT_CREATE || p === PERMISSIONS.PRODUCT_UPDATE,
      )
    )
      throw new HttpError("Izin edit produk diperlukan", 403);
    if (
      !Array.isArray(candidates) ||
      candidates.length > 50 ||
      candidates.some(
        (c) =>
          !c ||
          typeof c.key !== "string" ||
          c.key.length > 200 ||
          !/^[A-Z0-9-]{1,80}$/.test(c.sku),
      )
    )
      throw new HttpError("Kandidat SKU tidak valid", 422);
    const { prisma } = await import("@/lib/prisma");
    const { createHash } = await import("node:crypto");
    let rows = candidates.map((c) => ({ ...c }));
    for (let round = 0; round < 3; round++) {
      const conflicts = new Set(
        (
          await prisma.productVariant.findMany({
            where: {
              OR: rows.map((r) => ({
                sku: { equals: r.sku, mode: "insensitive" as const },
              })),
            },
            select: { sku: true },
          })
        ).map((r) => r.sku.toUpperCase()),
      );
      const assigned = new Set<string>();
      let retry = false;
      rows = rows.map((row, i) => {
        if (!conflicts.has(row.sku) && !assigned.has(row.sku)) {
          assigned.add(row.sku);
          return row;
        }
        const suffix =
          "-" +
          createHash("sha256")
            .update(candidates[i].key + ":" + round)
            .digest("hex")
            .slice(0, 10)
            .toUpperCase();
        const sku = candidates[i].sku.slice(0, 80 - suffix.length) + suffix;
        assigned.add(sku);
        retry = true;
        return { ...row, sku };
      });
      if (!retry) return rows;
    }
    throw new HttpError(
      "SKU masih bentrok. Ubah SKU manual atau coba kembali.",
      409,
    );
  });
}
