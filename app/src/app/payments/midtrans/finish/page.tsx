import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { scope } from "@/modules/payments/midtrans/settings";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const user = await getCurrentUser(false); const { order_id } = await searchParams;
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/payments/midtrans/finish?order_id=${encodeURIComponent((order_id || "").slice(0, 50))}`)}`);
  const attempt = order_id && order_id.length <= 50 ? await prisma.midtransAttempt.findFirst({ where: { providerOrderId: order_id,
    configuration: { storeScope: scope() }, payment: { order: { userId: user.id } } }, select: { payment: { select: { orderId: true } } } }) : null;
  redirect(attempt ? `/checkout/payment/${attempt.payment.orderId}` : "/orders");
}
