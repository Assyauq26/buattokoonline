import { handle, fail } from "@/lib/response";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getObject } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Private payment-proof serving. Requires payment.read permission (session cookie).
 * The caller supplies a PaymentConfirmation id — the storage path is read from the
 * database record, so arbitrary/traversal storage paths cannot be requested.
 */
export async function GET(req: Request) {
  return handle(async () => {
    await requirePermission(PERMISSIONS.PAYMENT_READ);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("id diperlukan", 400);

    const confirmation = await prisma.paymentConfirmation.findUnique({
      where: { id },
      select: { proofPath: true, proofMime: true },
    });
    if (!confirmation) return fail("Bukti tidak ditemukan", 404);

    const { data, contentType } = await getObject(confirmation.proofPath);
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": confirmation.proofMime || contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  });
}
