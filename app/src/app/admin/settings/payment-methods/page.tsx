import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Landmark, QrCode, Mail, ArrowRight } from "lucide-react";
export default async function Page() {
  const user = await requireBackofficeUser(PERMISSIONS.PAYMENT_READ);
  const count = await prisma.bankAccount.count({
    where: { deletedAt: null, isActive: true },
  });
  return (
    <div className="settings-form">
      <header>
        <h1>Metode Pembayaran</h1>
        <p>Metode pembayaran yang tersedia di toko Anda.</p>
      </header>
      <section className="settings-card identity-fields">
        <div className="flex items-center gap-3">
          <Landmark size={22} />
          <h2 className="!mb-0">Transfer Bank Manual</h2>
        </div>
        <p className="text-sm">
          <strong>{count ? "Aktif" : "Belum aktif"}</strong> · {count} rekening
          aktif
        </p>
        <p className="text-sm text-zinc-600">
          Pembeli mengunggah bukti transfer. Verifikasi pembayaran tetap
          dilakukan melalui menu Pembayaran.
        </p>
        {user.permissions.includes(PERMISSIONS.BANK_MANAGE) && (
          <Link
            className="setting-outline"
            href="/admin/settings/bank-accounts"
          >
            Kelola Rekening Bank
          </Link>
        )}
      </section>
      {[
        {
          href: "gopay-qris",
          title: "QRIS GoPay Merchant",
          Icon: QrCode,
          description:
            "Integrasi tidak resmi. Koneksi merchant belum tervalidasi; belum tersedia di checkout.",
        },
        {
          href: "gmail-bank",
          title: "Notifikasi bank melalui Gmail",
          Icon: Mail,
          description:
            "Akses baca Gmail melalui Google OAuth. Parser bank belum tervalidasi; belum tersedia di checkout.",
        },
      ].map(({ href, title, Icon, description }) => (
        <section key={href} className="settings-card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="!mb-0 flex items-center gap-3">
              <Icon size={22} aria-hidden="true" />
              {title}
            </h2>
            <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
              Belum aktif
            </span>
          </div>
          <p className="text-sm text-zinc-600">{description}</p>
          <Link
            className="setting-outline inline-flex items-center gap-2"
            href={`/admin/settings/payment-methods/${href}`}
          >
            Lihat kesiapan <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      ))}
      <Link className="setting-outline" href="/admin/payments/evidence">
        Transaksi perlu pemeriksaan
      </Link>
    </div>
  );
}
