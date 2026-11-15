import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { handle, fail, ok } from "@/lib/response";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getCurrentUser(false);
    if (!user) return fail("Sesi wajib tersedia", 401);
    const { id } = await params;
    if (!id || id.length > 100) return fail("Pesanan tidak ditemukan", 404);
    const order = await prisma.order.findFirst({ where: { id, userId: user.id },
      select: { status: true, paymentStatus: true, expiresAt: true } });
    if (!order) return fail("Pesanan tidak ditemukan", 404);
    const response = ok({ ...order, serverNow: new Date().toISOString() });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
