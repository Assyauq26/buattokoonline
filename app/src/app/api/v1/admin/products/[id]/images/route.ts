import { assertSameOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok, HttpError } from "@/lib/response";
import { MAX_IMAGE_BYTES, uploadProductImage } from "@/modules/catalog/product-images.service";
import { revalidateTag } from "next/cache";
import { CATALOG_CACHE_TAG } from "@/modules/catalog/catalog-cache";
import { readUploadFormData } from "@/lib/upload-body";

export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
    const form = await readUploadFormData(req, MAX_IMAGE_BYTES + 128 * 1024);
    const file = form.get("image");
    if (!(file instanceof File)) throw new HttpError("File gambar diperlukan", 422);
    const purpose = form.get("purpose") || "gallery";
    if (purpose !== "gallery" && purpose !== "option") throw new HttpError("Jenis foto tidak valid", 422);
    const result = await uploadProductImage(actor, (await params).id, String(form.get("updatedAt") || ""), new Uint8Array(await file.arrayBuffer()), file.type, String(form.get("alt") || ""), purpose);
    revalidateTag(CATALOG_CACHE_TAG);
    return ok(result, 201);
  });
}
