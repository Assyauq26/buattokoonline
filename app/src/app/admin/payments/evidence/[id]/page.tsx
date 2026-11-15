import { evidenceCandidateSuggestions } from "@/modules/payments/evidence/candidate-suggestions";
import { formatIDR } from "@/lib/money";
import { evidenceReasonLabel } from "@/modules/payments/evidence/presentation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { prisma } from "@/lib/prisma";
import { previewEnabled } from "@/modules/payments/evidence/policy";
import { storeScope } from "@/modules/payments/evidence/repository";
import { signatureAuditState } from "@/modules/payments/evidence/signature-audit";
import { PaymentEvidenceReview } from "@/components/admin/payment-evidence-review";
import { BLU_CHECKOUT_METHOD, bluCheckoutEnabled } from "@/modules/payments/evidence/blu-checkout";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { BluReviewNote } from "@/components/admin/blu-review-note";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireEvidenceAdmin(true);
  if (!previewEnabled()) notFound();
  const { id } = await params,
    now = new Date();
  const e = await prisma.incomingPaymentEvidence.findFirst({
    where: { id, source: { storeScope: storeScope() } },
    include: {
      source: { select: { id: true, label: true, kind: true } },
      claim: {
        select: {
          createdAt: true,
          reason: true,
          attempt: {
            select: {
              payment: { select: { status: true, order: { select: { orderNumber: true } } } },
            },
          },
        },
      },
    },
  });
  if (!e) notFound();
  const signatureRecord = await prisma.paymentEvidenceReview.findFirst({
    where: { sourceId: e.sourceId, evidenceId: e.id, action: "BLU_SIGNATURE_CHECK" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { reason: true },
  });
  const signature = signatureAuditState(e, signatureRecord?.reason);
  const candidates = e.claim
    ? []
    : await evidenceCandidateSuggestions(e.id, now);
  const realCandidates = candidates.filter(c => c.payment.method === BLU_CHECKOUT_METHOD);
  const history = await prisma.paymentEvidenceReview.findMany({ where: { sourceId: e.sourceId, evidenceId: e.id,
    action: { not: "BLU_SIGNATURE_CHECK" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30,
    select: { id: true, reason: true, createdAt: true, action: true } });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        className="inline-flex min-h-11 items-center text-sm"
        href="/admin/payments/evidence"
      >
        ← Kembali ke pemeriksaan
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Pemeriksaan bukti pembayaran
        </h1>
        <p className="mt-2 text-sm text-zinc-600">{e.source.label}</p>
      </header>
      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold">
          {e.claim
            ? e.claim.attempt.payment.status === "PAID" ? "Pembayaran disetujui seller" : "Sudah dikaitkan · belum menyatakan lunas"
            : candidates.length === 1
              ? "Nominal dan waktu cocok"
              : candidates.length > 1
                ? "Beberapa pesanan cocok"
                : "Perlu pemeriksaan"}
        </h2>
        <p className="text-2xl font-semibold tabular-nums">
          {e.amount === null
            ? "Nominal belum valid"
            : e.currency === "IDR"
              ? formatIDR(e.amount)
              : `${e.currency} ${e.amount.toLocaleString("id-ID")}`}
        </p>
        <p className="break-words text-sm text-zinc-600">
          {e.source.kind === "GMAIL_BANK" &&
          e.reason === "MISSING_STABLE_TRANSACTION_ID"
            ? "Email terdeteksi. Pencocokan menggunakan nominal total dan waktu transaksi."
            : evidenceReasonLabel(e.reason)}
        </p>
        <p className="text-sm text-zinc-600">
          {signature.verified
            ? "Tanda tangan email dari domain blu terverifikasi, termasuk isi email secara utuh. Ini bukan konfirmasi saldo atau pelunasan pesanan."
            : signature.retry
              ? "Kunci tanda tangan email belum dapat diperiksa. Coba baca email lagi; hasil tetap memerlukan pemeriksaan manual."
            : e.trusted
            ? "Catatan sumber tersedia untuk pemeriksaan pembayaran."
            : "Keaslian sumber belum diverifikasi untuk pemrosesan pembayaran di sistem."}
        </p>
        {e.claim && (
          <p className="text-sm">
            {e.claim.attempt.payment.order.orderNumber} · {e.claim.reason}
          </p>
        )}
      </section>
      {!e.claim && (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="font-semibold">Pencocokan nominal &amp; waktu</h2>
          <p className="text-sm text-zinc-600">
            Total berkode unik harus sama persis dan waktu transaksi harus
            berada dalam batas pembayaran pesanan. Nama pembayar dan referensi
            bank tidak digunakan untuk mencari kecocokan.
          </p>
          {candidates.length ? (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {candidates.map((c) => (
                <li key={c.id} className="space-y-1 p-3">
                  <p className="break-all font-semibold">
                    {c.payment.order.orderNumber}
                  </p>
                  <p className="text-sm tabular-nums">
                    {formatIDR(c.baseAmount)} + kode unik{" "}
                    {formatIDR(c.uniqueCode)} ={" "}
                    <strong>{formatIDR(c.payable)}</strong>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-zinc-50 p-3 text-sm">
              Belum ada pesanan terbuka dengan nominal dan waktu yang cocok.
            </p>
          )}
          <p className="text-sm text-zinc-600">
            {candidates.length > 1
              ? "Ada lebih dari satu kandidat. Periksa konflik sebelum melanjutkan."
              : "Hasil pencocokan belum mengubah status pesanan menjadi lunas. Aktivasi pembayaran tetap menunggu pengujian dan verifikasi sumber."}
          </p>
        </section>
      )}
      {!e.claim && (
        <p className="rounded-xl bg-zinc-100 p-4 text-sm">
          {bluCheckoutEnabled() ? "Hasil pencocokan belum menyatakan lunas. Status bank yang belum pasti harus diperiksa seller pada mutasi asli."
            : "Pencocokan ini belum memproses pembayaran. Fitur belum aktif di checkout."}
        </p>
      )}
      {!e.claim && signature.verified && realCandidates.length > 0 && actor.permissions.includes(PERMISSIONS.PAYMENT_VERIFY) && (
        <PaymentEvidenceReview evidenceId={e.id} candidates={realCandidates.map(c => ({ id: c.id,
          orderNumber: c.payment.order.orderNumber, payable: c.payable }))} />
      )}
      {history.length > 0 && <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold">Riwayat pemeriksaan</h2>
        <ol className="divide-y divide-zinc-100">{history.map(h => <li key={h.id} className="space-y-1 py-3 text-sm">
          <p className="font-medium">{h.action === "BLU_BANK_CONFIRMED_BY_SELLER" ? "Disetujui setelah pemeriksaan bank"
            : h.action === "BLU_LATE_REVIEW" ? "Pembayaran ditutup · pemeriksaan terpisah"
            : h.action === "BLU_AMBIGUOUS_REVIEW" ? "Beberapa notifikasi cocok" : "Pemeriksaan tersimpan"}</p>
          <p className="break-words text-zinc-600">{h.reason}</p>
          <time className="text-xs text-zinc-500" dateTime={h.createdAt.toISOString()}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(h.createdAt)} WIB</time>
        </li>)}</ol>
      </section>}
      {e.source.kind === "GMAIL_BANK" && actor.permissions.includes(PERMISSIONS.PAYMENT_VERIFY) && <BluReviewNote evidenceId={e.id} />}
    </div>
  );
}
