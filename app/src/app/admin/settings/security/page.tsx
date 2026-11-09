import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
export default async function Page() {
  await requireBackofficeUser();
  return (
    <>
      <h1 className="text-2xl font-bold">Keamanan Akun</h1>
      <p>
        Gunakan email seller terverifikasi untuk mengganti password melalui kode
        OTP. Setelah reset berhasil, sesi lama dicabut.
      </p>
      <Link
        className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-white"
        href="/seller-password-reset"
      >
        Ganti password dengan OTP
      </Link>
    </>
  );
}
