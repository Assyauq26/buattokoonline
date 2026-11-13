import { evidenceReasonLabel } from "@/modules/payments/evidence/presentation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { previewEnabled } from "@/modules/payments/evidence/policy";
import { storeScope } from "@/modules/payments/evidence/repository";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireBackofficeUser(PERMISSIONS.PAYMENT_READ);
  const rows = previewEnabled()
    ? await prisma.incomingPaymentEvidence.findMany({
        where: { source: { storeScope: storeScope() } },
        select: {
          id: true,
          amount: true,
          currency: true,
          reason: true,
          createdAt: true,
          source: { select: { label: true } },
          claim: { select: { createdAt: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      })
    : [];
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/admin/settings/payment-methods"
        className="inline-flex min-h-11 items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Metode pembayaran
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Perlu pemeriksaan</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Bukti dari sumber pembayaran. Pencocokan belum berarti pesanan lunas.
        </p>
      </header>
      <p className="rounded-xl bg-zinc-100 p-4 text-sm">
        Periksa sumber merchant atau bank secara langsung. Jangan menerima email
        diteruskan, nominal saja, atau status yang tidak dikenal sebagai bukti
        lunas.
      </p>
      {!rows.length ? (
        <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-12 text-center">
          <ClipboardCheck
            className="mx-auto mb-4 text-zinc-500"
            size={28}
            aria-hidden="true"
          />
          <h2 className="font-semibold">Belum ada bukti pembayaran</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Koneksi baru tetap nonaktif selama proses peninjauan. Bukti transfer
            manual tersedia di menu Pembayaran.
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-black px-4 text-sm font-medium text-white"
            href="/admin/payments"
          >
            Buka pembayaran manual
          </Link>
        </section>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <h2 className="break-words font-semibold">
                  <Link
                    href={`/admin/payments/evidence/${row.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.source.label}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {row.claim
                    ? "Sudah dikaitkan · belum menyatakan lunas"
                    : "Perlu pemeriksaan seller"}
                </p>
                <p className="mt-1 break-all text-xs text-zinc-500">
                  Alasan: {evidenceReasonLabel(row.reason)}
                </p>
              </div>
              <p className="font-semibold tabular-nums">
                {row.amount === null
                  ? "Nominal belum valid"
                  : `${row.currency} ${row.amount.toLocaleString("id-ID")}`}
              </p>
            </article>
          ))}
        </div>
      )}
      {rows.length === 100 && (
        <p className="text-sm text-zinc-600">
          Menampilkan 100 bukti terbaru. Riwayat lengkap dipertahankan untuk
          pemeriksaan operator.
        </p>
      )}
    </div>
  );
}
