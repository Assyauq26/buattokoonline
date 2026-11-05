
import { assertSameOrigin } from "@/lib/mutation-origin";
import { readUploadFormData } from "@/lib/upload-body";
import { handle, HttpError, ok } from "@/lib/response";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { appearanceSessionHash } from "@/modules/appearance/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { uploadHeroImage, MAX_HERO_BYTES } from "@/modules/hero/media";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_UPDATE);
    const form = await readUploadFormData(req, MAX_HERO_BYTES + 131072);
    const file = form.get("image");
    if (!(file instanceof File)) throw new HttpError("Gambar Hero diperlukan", 422);
    const response = ok(await uploadHeroImage(
      actor.id, await appearanceSessionHash(),
      String(form.get("requestId") || ""),
      new Uint8Array(await file.arrayBuffer()), file.type,
    ), 201);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
