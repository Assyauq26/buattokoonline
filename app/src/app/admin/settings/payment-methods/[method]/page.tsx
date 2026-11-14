import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { previewEnabled } from "@/modules/payments/evidence/policy";
import { storeScope } from "@/modules/payments/evidence/repository";
import { PaymentEvidenceSettings } from "@/components/admin/payment-evidence-settings";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ method: string }>;
  searchParams: Promise<{ oauth?: string }>;
}) {
  const user = await requireEvidenceAdmin(true);
  const { method } = await params,
    { oauth } = await searchParams;
  if (!["gopay-qris", "gmail-bank"].includes(method)) notFound();
  const gopay = method === "gopay-qris",
    preview = previewEnabled();
  const kind = gopay ? "GOPAY_QRIS" : "GMAIL_BANK";
  const [sources, banks] = await Promise.all([
    preview
      ? prisma.paymentEvidenceSource.findMany({
          where: { storeScope: storeScope(), kind },
          select: {
            id: true,
            label: true,
            health: true,
            lastCheckedAt: true,
            encryptedSecret: true,
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [],
    preview && !gopay
      ? prisma.bankAccount.findMany({
          where: { isActive: true, deletedAt: null },
          select: { id: true, displayName: true, accountNumber: true },
          take: 100,
        })
      : [],
  ]);
  const oauthEnabled =
    process.env.PAYMENT_GMAIL_OAUTH_TEST === "true" &&
    !!process.env.PAYMENT_GOOGLE_CLIENT_ID &&
    !!process.env.PAYMENT_GOOGLE_CLIENT_SECRET &&
    !!process.env.PAYMENT_INTEGRATION_ENCRYPTION_KEY;
  return (
    <div className="settings-form !max-w-3xl">
      <Link
        href="/admin/settings/payment-methods"
        className="inline-flex min-h-11 items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Metode pembayaran
      </Link>
      <header>
        <span className="mb-3 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium">
          Belum tersedia di checkout
        </span>
        <h1>
          {gopay ? "QRIS GoPay Merchant" : "Notifikasi bank melalui Gmail"}
        </h1>
        <p>
          {gopay
            ? "Konfigurasi QRIS dan kesiapan koneksi merchant."
            : "Kesiapan akses notifikasi melalui Google OAuth resmi."}
        </p>
      </header>
      <section className="settings-card space-y-3">
        <h2 className="!mb-0 flex items-center gap-2">
          <Info size={19} aria-hidden="true" />
          Sebelum menghubungkan
        </h2>
        <p className="text-sm leading-relaxed text-zinc-600">
          {gopay
            ? "Integrasi GoPay ini bukan API pembayaran resmi dan dapat berubah atau berhenti bekerja. Login, OTP, dan refresh sesi belum tervalidasi. Jangan masukkan password, OTP, cookie, atau token merchant ke formulir ini."
            : "Google OAuth menggunakan izin baca isi Gmail, yang mencakup mailbox secara luas. Filter notifikasi tidak membatasi izin tersebut. Gunakan mailbox khusus notifikasi. Belum ada parser bank yang dinyatakan siap untuk penggunaan nyata."}
        </p>
        {!gopay && (
          <p className="text-sm leading-relaxed text-zinc-600">
            Operator perlu menyiapkan klien Google untuk domain toko ini. Proyek
            dengan status Testing dapat meminta hubungkan ulang setelah tujuh
            hari. Verifikasi Google yang berlaku perlu diselesaikan sebelum
            distribusi umum.
          </p>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-zinc-50 p-3 text-sm">
          <ShieldCheck className="shrink-0" size={18} aria-hidden="true" />
          Nominal dan waktu hanya membantu pemeriksaan. Bukti yang terdeteksi
          tidak otomatis membuat pesanan lunas.
        </p>
      </section>
      {oauth && (
        <p role="status" className="rounded-xl bg-zinc-100 p-4 text-sm">
          {oauth === "connected"
            ? "Akses Gmail tersimpan. Gunakan Baca notifikasi blu untuk pemeriksaan; checkout tetap nonaktif."
            : "Google belum terhubung. Coba hubungkan ulang dari halaman ini."}
        </p>
      )}
      {preview ? (
        <PaymentEvidenceSettings
          kind={kind}
          sources={sources.map((s) => ({
            id: s.id,
            label: s.label,
            health: s.health,
            connected: !!s.encryptedSecret,
            lastCheckedAt: s.lastCheckedAt?.toISOString() || null,
          }))}
          banks={banks.map((b) => ({
            id: b.id,
            label: `${b.displayName} · ••••${b.accountNumber.slice(-4)}`,
          }))}
          canManage={user.permissions.includes(PERMISSIONS.BANK_MANAGE)}
          oauthEnabled={oauthEnabled}
        />
      ) : (
        <section className="settings-card">
          <h2>Konfigurasi belum dibuka</h2>
          <p className="text-sm text-zinc-600">
            Fitur sedang ditinjau. Transfer Bank Manual tetap tersedia. Aktivasi
            hanya dapat dilanjutkan setelah kesiapan koneksi dan pemeriksaan
            keamanan terpenuhi.
          </p>
        </section>
      )}
    </div>
  );
}
