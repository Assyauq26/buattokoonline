import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { storeMailStatus } from "@/modules/auth/registration-otp-email";
import { EmailOtpTest } from "@/components/admin/email-otp-test";

export default async function EmailOtpPage() {
  await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_PUBLISH);
  const status = await storeMailStatus().catch(() => null);
  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 pb-20">
      <header>
        <p className="text-sm font-medium text-zinc-600">Pengaturan</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">Email &amp; OTP</h1>
        <p className="mt-2 text-sm text-zinc-600">Pengiriman email autentikasi dikelola Buattokosendiri.</p>
      </header>
      <dl className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4 sm:px-6">
        {[
          ["Status layanan", status?.configured ? "Siap diuji" : "Tidak tersedia"],
          ["Konfigurasi pengiriman", status?.configured ? "Terdeteksi" : "Belum siap"],
          ["Nama toko dalam email", status?.brand ?? "Belum dapat dimuat"],
          ["Pengirim customer", status?.sender ?? "Belum dapat dimuat"],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <dt className="text-sm text-zinc-600">{label}</dt>
            <dd className="break-words text-sm font-semibold text-zinc-950">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-zinc-950">Uji pengiriman</h2>
        <p className="text-sm text-zinc-600">
          {status?.configured ? "Kirim email dengan identitas toko ke alamat akun Anda." : "Hubungi Buattokosendiri untuk menyiapkan layanan pengiriman."}
        </p>
        <EmailOtpTest enabled={Boolean(status?.configured)} />
      </section>
    </section>
  );
}
