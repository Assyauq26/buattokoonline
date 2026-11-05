import Link from "next/link";
import { CreditCard, FileText } from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listPendingVerifications } from "@/modules/payments/payments.service";
import { formatIDR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentVerify } from "@/components/admin/payment-verify";

export const dynamic = "force-dynamic";

type AdminPaymentsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsPageProps) {
  const actor = await requireBackofficeUser(PERMISSIONS.PAYMENT_READ);
  const { q } = await searchParams;
  const payments = await listPendingVerifications(q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black text-ink">Verifikasi Pembayaran</h1>
        <p className="text-sm text-ink-soft">{payments.length} pembayaran menunggu verifikasi</p>
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={<CreditCard size={40} />} title="Tidak ada pembayaran menunggu" description="Semua pembayaran sudah diverifikasi." />
      ) : (
        <div className="space-y-4">
          {payments.map((p) => {
            const latest = p.confirmations.find((c) => c.status === "SUBMITTED") ?? p.confirmations[0];
            const amountMatch = latest && latest.amount === p.amount;
            return (
              <div key={p.id} className="grid gap-4 rounded-2xl border border-line bg-white p-5 md:grid-cols-[1fr_240px]" data-testid={`payment-card-${p.id}`}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link className="break-all font-display font-bold text-ink underline" href={`/admin/orders/${p.orderId}`}>{p.order.orderNumber}</Link>
                      <p className="text-xs text-ink-muted">{p.order.user.name} · {p.order.user.email}</p>
                    </div>
                    <Badge variant="warning">Menunggu Verifikasi</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 text-sm">
                    <div><span className="text-ink-muted">Nominal Tagihan</span><p className="font-semibold">{formatIDR(p.amount)}</p></div>
                    <div>
                      <span className="text-ink-muted">Nominal Transfer</span>
                      <p className={`font-semibold ${amountMatch ? "text-success" : "text-destructive"}`} data-testid="transfer-amount">
                        {latest ? formatIDR(latest.amount) : "-"}
                      </p>
                    </div>
                    <div><span className="text-ink-muted">Bank Pengirim</span><p className="font-semibold">{latest?.senderBank ?? "-"}</p></div>
                    <div><span className="text-ink-muted">Nama Pengirim</span><p className="font-semibold">{latest?.senderName ?? "-"}</p></div>
                    <div><span className="text-ink-muted">Tanggal Transfer</span><p className="font-semibold">{latest ? new Date(latest.transferDate).toLocaleDateString("id-ID") : "-"}</p></div>
                    <div><span className="text-ink-muted">Tujuan</span><p className="font-semibold">{p.bankAccount?.displayName ?? "-"}</p></div>
                  </div>

                  {latest?.note && <p className="text-sm text-ink-soft">Catatan: {latest.note}</p>}

                  {p.confirmations.length > 1 && (
                    <details className="text-xs text-ink-soft">
                      <summary className="cursor-pointer font-semibold">Riwayat pengajuan ({p.confirmations.length})</summary>
                      <ul className="mt-2 space-y-1">
                        {p.confirmations.map((c) => (
                          <li key={c.id}>{new Date(c.createdAt).toLocaleString("id-ID")} — {c.status}{c.rejectionReason ? `: ${c.rejectionReason}` : ""}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                <div className="space-y-3">
                  {latest && (
                    latest.proofMime === "application/pdf" ? (
                      <a href={`/api/v1/admin/payments/proof?id=${encodeURIComponent(latest.id)}`} target="_blank" rel="noreferrer" className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-line text-sm text-ink-soft hover:bg-surface" data-testid="proof-link">
                        <FileText size={28} /> Lihat PDF
                      </a>
                    ) : (
                      <a href={`/api/v1/admin/payments/proof?id=${encodeURIComponent(latest.id)}`} target="_blank" rel="noreferrer" data-testid="proof-link">
                        {/* Keep the session cookie on this private proof request; an image optimizer cannot authenticate it. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/v1/admin/payments/proof?id=${encodeURIComponent(latest.id)}`} alt="Bukti transfer" className="h-32 w-full rounded-xl border border-line object-cover" />
                      </a>
                    )
                  )}
                  {actor.permissions.includes(PERMISSIONS.PAYMENT_VERIFY) && <PaymentVerify paymentId={p.id} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
