import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const row = await prisma.storeAppearance.findUnique({
      where: { key: "primary" },
      select: { publishedVersion: true },
    });
    return Response.json(
      { version: row?.publishedVersion ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
