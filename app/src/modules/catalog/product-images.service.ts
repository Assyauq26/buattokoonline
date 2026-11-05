import { randomUUID } from "crypto";
import { getObject, putObject, removeObject, STORAGE_APP } from "@/lib/storage";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  attachProductImage,
  assertCatalogPermission,
  getManagedProduct,
} from "./product-management.service";
import type { CatalogActor } from "./product-management.validation";

export {
  MAX_IMAGE_BYTES,
  validateProductImage,
} from "./product-image-validation";
import { validateProductImage } from "./product-image-validation";
export async function uploadProductImage(
  actor: CatalogActor,
  productId: string,
  updatedAt: string,
  bytes: Uint8Array,
  mime: string,
  alt = "",
  purpose: "gallery" | "option" = "gallery",
) {
  assertCatalogPermission(actor, PERMISSIONS.PRODUCT_UPDATE);
  const current = await getManagedProduct(actor, productId);
  if (current.updatedAt !== updatedAt)
    throw new HttpError(
      "Produk sudah berubah. Muat ulang sebelum mengunggah.",
      409,
    );
  if (
    (purpose === "option"
      ? current.optionImages.length
      : current.images.length) >= (purpose === "option" ? 50 : 10)
  )
    throw new HttpError("Batas foto produk tercapai", 422);
  if (alt.length > 200)
    throw new HttpError("Teks alternatif maksimal 200 karakter", 422);
  const extension = validateProductImage(bytes, mime);
  const id = randomUUID();
  const path = `${STORAGE_APP}/product-images/${productId}/${id}.${extension}`;
  const stored = await putObject(path, bytes, mime);
  if (stored.path !== path)
    throw new Error("Storage returned an unexpected object path");
  try {
    return await attachProductImage(actor, productId, updatedAt, {
      isVariation: purpose === "option",
      id,
      url: `/api/v1/product-images/${id}?object=${encodeURIComponent(path)}`,
      alt: alt.trim(),
    });
  } catch (error) {
    try {
      await removeObject(stored.path);
    } catch {
      console.error("[storage] Product image compensation failed");
    }
    throw error;
  }
}
export async function readManagedProductImage(image: {
  id: string;
  productId: string;
  url: string;
}) {
  const url = new URL(image.url, "http://localhost");
  const path = url.searchParams.get("object") || "";
  const extension = path.split(".").pop();
  if (
    url.origin !== "http://localhost" ||
    url.pathname !== `/api/v1/product-images/${image.id}` ||
    !["jpg", "png", "webp"].includes(extension || "") ||
    (!path.endsWith(
      `/product-images/${image.productId}/${image.id}.${extension}`,
    ) &&
      !path.endsWith(
        `/product-images/staged-${image.id}/${image.id}.${extension}`,
      )) ||
    !/^[a-zA-Z0-9_/-]+\.(jpg|png|webp)$/.test(path)
  )
    throw new HttpError("Gambar tidak ditemukan", 404);
  const object = await getObject(path);
  return {
    data: object.data,
    contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
  };
}
