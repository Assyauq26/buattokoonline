import { fashionRendition } from "@/modules/catalog/fashion-rendition";
import { handle } from "@/lib/response";
import { readLogo } from "@/modules/appearance/media";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const object = await readLogo((await ctx.params).id);
    const rendition = await fashionRendition(req, "brand-" + (await ctx.params).id, async () => object.data);
    if (rendition) return rendition;
    return new Response(Buffer.from(object.data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
