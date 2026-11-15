import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { handle, fail, ok } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { createHash } from "node:crypto";
import { BLU_CHECKOUT_METHOD } from "@/modules/payments/evidence/blu-checkout";
import { runBluWorker } from "@/modules/payments/evidence/blu-worker";
import { GOPAY_CHECKOUT_METHOD } from "@/modules/payments/evidence/gopay-checkout";
import { runGoPayWorker } from "@/modules/payments/evidence/gopay-worker";
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

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser(false);
    if (!user) return fail("Sesi wajib tersedia", 401);
    const { id } = await context.params;
    if (!id || id.length > 100) return fail("Pesanan tidak ditemukan", 404);
    const order = await prisma.order.findFirst({ where: { id, userId: user.id },
      select: { payment: { select: { method: true, status: true, evidenceAttempt: { select: { sourceId: true } } } } } });
    if (!order) return fail("Pesanan tidak ditemukan", 404);
    const bucket = Math.floor(Date.now() / 60_000);
    await consumeAuthBucket("payment-check:"+createHash("sha256").update(user.id).digest("hex")+":"+bucket, 3, new Date((bucket+1)*60_000));
    let checkDeferred=false;
    if (order.payment?.method === BLU_CHECKOUT_METHOD && order.payment.evidenceAttempt &&
        ["PENDING_PAYMENT", "WAITING_VERIFICATION"].includes(order.payment.status))
      checkDeferred=(await runBluWorker(order.payment.evidenceAttempt.sourceId, 15_000)).failed>0;
    if (order.payment?.method === GOPAY_CHECKOUT_METHOD && order.payment.evidenceAttempt &&
        ["PENDING_PAYMENT", "WAITING_VERIFICATION"].includes(order.payment.status))
      checkDeferred=(await runGoPayWorker(order.payment.evidenceAttempt.sourceId,15_000)).failed>0;
    const current=await GET(req,context);if(!current.ok)return current;
    const payload=await current.json();const response=ok({...payload.data,checkDeferred});
    response.headers.set("Cache-Control","private, no-store");return response;
  });
}
