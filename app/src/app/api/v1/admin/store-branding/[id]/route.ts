import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { handle, ok } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { appearanceSessionHash } from "@/modules/appearance/session";
import { readLogo, retireLogo } from "@/modules/appearance/media";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, ctx: Context) {
  return handle(async () => {
    const actor = await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ),
      id = (await ctx.params).id;
    const object = await readLogo(id, {
      id: actor.id,
      sessionHash: await appearanceSessionHash(),
    });
    return new Response(Buffer.from(object.data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  });
}
export async function DELETE(req: Request, ctx: Context) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_UPDATE);
    await retireLogo(
      (await ctx.params).id,
      actor.id,
      await appearanceSessionHash(),
    );
    return ok({ retired: true });
  });
}
