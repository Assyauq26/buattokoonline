import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
export default async function Page() {
  await requireBackofficeUser(PERMISSIONS.PAYMENT_READ);
  return (
    <>
      <h1 className="text-2xl font-bold">Metode Pembayaran</h1>
      <h2>Transfer Bank Manual</h2>
      <p>
        Metode ini tersedia bila ada rekening bank aktif. Verifikasi bukti dan
        transaksi tetap dilakukan melalui menu Pembayaran.
      </p>
      <Link
        className="inline-flex min-h-11 items-center underline"
        href="/admin/settings/bank-accounts"
      >
        Kelola rekening dan aktivasi pembayaran
      </Link>
    </>
  );
}
