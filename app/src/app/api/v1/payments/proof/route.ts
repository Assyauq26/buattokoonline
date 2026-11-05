import { handle, fail } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { getObject } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Customers may retrieve only their own transfer confirmation, never an arbitrary storage path. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("id diperlukan", 400);
    const confirmation = await prisma.paymentConfirmation.findFirst({
      where: { id, payment: { order: { userId: user.id } } },
      select: { proofPath: true, proofMime: true },
    });
    if (!confirmation) return fail("Bukti tidak ditemukan", 404);
    const { data, contentType } = await getObject(confirmation.proofPath);
    const mime = ["image/jpeg","image/png","image/webp","application/pdf"].includes(confirmation.proofMime)
      ? confirmation.proofMime : contentType;
    return new Response(Buffer.from(data), { headers: {
      "Content-Type": mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    } });
  });
}
