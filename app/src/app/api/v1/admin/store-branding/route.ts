import { assertSameOrigin } from "@/lib/mutation-origin";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok, HttpError } from "@/lib/response";
import { readUploadFormData } from "@/lib/upload-body";
import { appearanceSessionHash } from "@/modules/appearance/session";
import { uploadLogo, MAX_LOGO_BYTES } from "@/modules/appearance/media";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_UPDATE);
    const form = await readUploadFormData(req, MAX_LOGO_BYTES + 131072),
      file = form.get("image");
    if (!(file instanceof File)) throw new HttpError("Logo diperlukan", 422);
    const response = ok(
      await uploadLogo(
        actor.id,
        await appearanceSessionHash(),
        String(form.get("requestId") || ""),
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      ),
      201,
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
