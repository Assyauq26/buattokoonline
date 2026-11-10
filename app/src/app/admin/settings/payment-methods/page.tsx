import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Landmark } from "lucide-react";
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
    </div>
  );
}
