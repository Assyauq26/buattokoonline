import { assertSameOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok } from "@/lib/response";
import { getObject } from "@/lib/storage";
import { productEditorSessionHash } from "@/modules/catalog/product-editor-session";
import {
  readStagedMedia,
  cancelStagedMedia,
} from "@/modules/catalog/staged-product-media";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  return handle(async () => {
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    const row = await readStagedMedia(
      actor,
      await productEditorSessionHash(),
      (await params).id,
    );
    const object = await getObject(row.objectPath, AbortSignal.timeout(15000));
    return new Response(Buffer.from(object.data), {
      headers: {
        "Content-Type": row.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
export async function DELETE(req: Request, { params }: Context) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    await cancelStagedMedia(
      actor,
      await productEditorSessionHash(),
      (await params).id,
    );
    return ok({ cancelled: true });
  });
}
