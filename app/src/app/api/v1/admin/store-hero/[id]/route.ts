
import { handle } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { appearanceSessionHash } from "@/modules/appearance/session";
import { readHeroImage } from "@/modules/hero/media";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    const image = await readHeroImage((await context.params).id, {
      id: actor.id, sessionHash: await appearanceSessionHash(),
    });
    return new Response(Buffer.from(image.data), { headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    } });
  });
}
