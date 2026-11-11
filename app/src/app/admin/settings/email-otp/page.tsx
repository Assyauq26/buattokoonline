import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { storeMailStatus } from "@/modules/auth/registration-otp-email";
import { EmailOtpTest } from "@/components/admin/email-otp-test";
import { mailBrandSyncPending } from "@/modules/auth/mail-brand-sync";

export default async function EmailOtpPage() {
  await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_PUBLISH);
  const [status, pending] = await Promise.all([
    storeMailStatus().catch(() => null),
    mailBrandSyncPending().catch(() => false),
  ]);
  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 pb-20">
      <header>
        <p className="text-sm font-medium text-zinc-600">Pengaturan</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">Email &amp; OTP <span className="rounded-full bg-zinc-100 px-2 py-1 align-middle text-xs font-medium">Beta</span></h1>
        <p className="mt-2 text-sm text-zinc-600">Pengiriman email autentikasi dikelola Buattokosendiri.</p>
        <p className="mt-2 text-sm text-zinc-600">Kapasitas bersama maksimal 100 email per hari pada paket Free, dengan batas per toko. Jika batas tercapai, email tidak dikirim atau diantre. Login dan pemulihan akun diprioritaskan.</p>
      </header>
      <dl className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4 sm:px-6">
        {[
          ["Status layanan", ({ active: "Aktif", preparing: "Sedang disiapkan", action: "Perlu tindakan", unavailable: "Gangguan layanan" })[status?.state ?? "unavailable"]],
          ["Identitas pengirim", pending ? "Sedang disinkronkan" : status?.state === "active" ? "Terverifikasi" : "Belum terverifikasi"],
          ["Nama tampilan toko", status?.desiredBrand ?? "Belum dapat dimuat"],
          ["Pengirim customer", status?.configured ? status.sender : "Belum dapat diverifikasi"],
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
          {status?.configured ? "Kirim email dengan identitas toko ke alamat akun Anda. Status aktif tidak menjamin email telah tiba; periksa kotak masuk setelah pengujian." :
            status?.state === "action" ? "Identitas toko perlu diselaraskan di platform Buattokosendiri. Periksa nama brand, domain, dan akun administrator." :
              "Aktivasi diproses otomatis melalui agent toko. Jika status tidak berubah, periksa koneksi agent ke platform."}
        </p>
        <EmailOtpTest enabled={Boolean(status?.configured)} />
      </section>
    </section>
  );
}
