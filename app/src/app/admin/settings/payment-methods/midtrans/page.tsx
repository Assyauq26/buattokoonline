import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { readSettings, scope } from "@/modules/payments/midtrans/settings";
import { MidtransSettings } from "@/components/admin/midtrans-settings";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireBackofficeUser(PERMISSIONS.BANK_MANAGE);
  const settings = await readSettings();
  const attempts = await prisma.midtransAttempt.findMany({ where: { configuration: { storeScope: scope() } }, orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, providerOrderId: true, state: true, providerStatus: true, amount: true, channel: true, lastError: true, lastCheckedAt: true,
      payment: { select: { orderId: true, order: { select: { orderNumber: true } } } }, configuration: { select: { environment: true } } } });
  return <div className="settings-form"><header><Link href="/admin/settings/payment-methods" className="inline-flex min-h-11 items-center text-sm underline">Metode Pembayaran</Link><h1>Midtrans Snap</h1><p>Gateway pembayaran resmi. Kelola merchant, checkout, dan sinkronisasi pembayaran.</p></header>
    <MidtransSettings initial={settings} />
    <section className="settings-card space-y-4"><h2>30 percobaan pembayaran terbaru</h2>{!attempts.length && <p className="text-sm text-zinc-500">Belum ada pembayaran Midtrans. Konfigurasi dapat disimpan sebelum transaksi pertama.</p>}
      {attempts.map(attempt => <article key={attempt.id} className="space-y-2 border-b border-zinc-200 py-3 text-sm"><Link className="font-semibold underline" href={`/admin/orders/${attempt.payment.orderId}/payment`}>{attempt.payment.order.orderNumber} · {formatIDR(attempt.amount)}</Link>
        <p>{attempt.configuration.environment} · {attempt.providerStatus || attempt.state} · {attempt.channel || "Kanal belum dipilih"}</p><p className="break-all text-xs text-zinc-500">{attempt.providerOrderId}</p>{attempt.lastError && <p>{attempt.lastError}</p>}
        <details><summary className="min-h-11 cursor-pointer py-3">Riwayat sinkronisasi</summary><EventHistory id={attempt.id} /></details></article>)}
    </section>
  </div>;
}
async function EventHistory({ id }: { id: string }) {
  const events = await prisma.midtransEvent.findMany({ where: { attemptId: id, attempt: { configuration: { storeScope: scope() } } }, orderBy: { receivedAt: "desc" }, take: 10,
    select: { id: true, kind: true, receivedAt: true, processedAt: true, lastError: true } });
  return <ul className="space-y-2 text-xs text-zinc-500">{events.map(event => <li key={event.id}>{event.receivedAt.toLocaleString("id-ID")} · {event.kind} · {event.processedAt ? "Diproses" : "Tersimpan; menunggu rekonsiliasi"}{event.lastError ? ` · ${event.lastError}` : ""}</li>)}</ul>;
}
