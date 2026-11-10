import { whatsappEnabled } from "@/modules/whatsapp/relay";
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
      {whatsappEnabled() && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Masuk dengan WhatsApp</h2>
          <p>
            Tautkan nomor pribadi untuk masuk ke dashboard. Gunakan password
            akun untuk mengonfirmasi.
          </p>
          <Link
            className="inline-flex min-h-11 items-center rounded-xl bg-black px-5 text-white mt-3"
            href="/whatsapp?account=seller&mode=link&redirectTo=%2Fadmin%2Fsettings%2Fsecurity"
          >
            Tautkan WhatsApp
          </Link>
        </section>
      )}
    </>
  );
}
