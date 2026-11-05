import { assertSameOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok, HttpError } from "@/lib/response";
import { readUploadFormData } from "@/lib/upload-body";
import { MAX_IMAGE_BYTES } from "@/modules/catalog/product-images.service";
import { productEditorSessionHash } from "@/modules/catalog/product-editor-session";
import { prisma } from "@/lib/prisma";
import { stageProductMedia } from "@/modules/catalog/staged-product-media";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    const form = await readUploadFormData(req, MAX_IMAGE_BYTES + 128 * 1024);
    const file = form.get("image");
    if (!(file instanceof File))
      throw new HttpError("File gambar diperlukan", 422);
    return ok(
      await stageProductMedia(
        actor,
        await productEditorSessionHash(),
        String(form.get("requestId") || ""),
        new Uint8Array(await file.arrayBuffer()),
        file.type,
        String(form.get("purpose") || "gallery"),
      ),
      201,
    );
  });
}

/** Restore only identifiers cached by this browser tab; ownership/session is rechecked. */
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    if (
      !actor.isAdmin ||
      !actor.permissions.some(
        (p) =>
          p === PERMISSIONS.PRODUCT_CREATE || p === PERMISSIONS.PRODUCT_UPDATE,
      )
    )
      throw new HttpError("Izin upload diperlukan", 403);
    const ids = (new URL(req.url).searchParams.get("ids") || "")
      .split(",")
      .filter(Boolean);
    if (ids.length > 60 || ids.some((id) => !/^[a-f0-9-]{36}$/.test(id)))
      throw new HttpError("Identitas foto tidak valid", 422);
    const rows = await prisma.stagedProductMedia.findMany({
      where: {
        id: { in: ids },
        actorId: actor.id,
        sessionHash: await productEditorSessionHash(),
        productId: null,
        cancelledAt: null,
        ready: true,
        expiresAt: { gt: new Date() },
      },
    });
    const response = ok(
      rows.map((row) => ({
        id: row.id,
        url: `/api/v1/admin/product-media/${row.id}`,
        alt: "",
        purpose: row.purpose,
        expiresAt: row.expiresAt.toISOString(),
      })),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  });
}
