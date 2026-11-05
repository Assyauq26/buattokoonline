
import { handle } from "@/lib/response";
import { readHeroImage } from "@/modules/hero/media";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const image = await readHeroImage((await context.params).id);
    return new Response(Buffer.from(image.data), { headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    } });
  });
}
