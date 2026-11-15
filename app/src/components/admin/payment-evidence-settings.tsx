"use client";
import { useState, type FormEvent } from "react";
import { Loader2, LockKeyhole, Unplug, Mail, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Source {
  id: string;
  label: string;
  health: string;
  connected: boolean;
  enabled?: boolean;
  readiness?: { ready: boolean; reason: string };
  qrisConfigured?:boolean;
  qrisVersion?:string;
  merchant?:{merchantId:string|null;merchantName:string|null;phoneSuffix:string;expiresAt:string}|null;
  lastCheckedAt: string | null;
}
const healthLabels: Record<string, string> = {
  NOT_CONNECTED: "Belum terhubung",
  DISCONNECTED: "Terputus",
  CONNECTED_PARSER_BLOCKED: "Gmail terhubung · menunggu pembacaan manual",
  RECONNECT_REQUIRED: "Hubungkan ulang",
  REVIEW_ONLY: "Hanya pemeriksaan seller",
  TEMPORARILY_UNAVAILABLE: "Sementara tidak tersedia",
  OTP_REQUESTING: "Meminta OTP",
  OTP_REQUIRED: "Menunggu verifikasi OTP · berlaku lima menit",
  MERCHANT_CONNECTED: "Akun dan merchant terhubung",
  MERCHANT_CHECK_REQUIRED: "Sesi diterima; klik Periksa koneksi merchant untuk menyelesaikan pemeriksaan akun",
};
export function PaymentEvidenceSettings({
  kind,
  sources,
  banks,
  canManage,
  oauthEnabled,
  bluCheckoutAvailable = false,
  goPayCheckoutAvailable = false,
}: {
  kind: "GOPAY_QRIS" | "GMAIL_BANK";
  sources: Source[];
  banks: Array<{ id: string; label: string }>;
  canManage: boolean;
  oauthEnabled: boolean;
  bluCheckoutAvailable?: boolean;
  goPayCheckoutAvailable?: boolean;
}) {
  const router = useRouter();
  const [qrisPayload, setQrisPayload] = useState("");
  async function uploadQris(file: File | undefined,sourceId?:string) {
    if (!file || pending) return;
    if (file.size > 4*1024*1024 || !["image/png","image/jpeg","image/webp"].includes(file.type)) { setMessage("Gunakan PNG, JPEG atau WebP maksimal 4 MB"); return; }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/v1/admin/payment-evidence/qris-image", { method: "POST", headers: { "Content-Type":file.type }, body:file, signal:AbortSignal.timeout(20000) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error?.message || "QRIS tidak terbaca");
      if(sourceId){await send({action:"set-gopay-qris",sourceId,payload:body.data.payload});router.refresh();}
      else setQrisPayload(body.data.payload);
      setMessage(`QRIS terbaca: ${body.data.merchantName} · ${body.data.merchantCity}. ${sourceId?"Tersimpan; aktifkan ulang checkout setelah memeriksa merchant.":"Simpan untuk menerapkan konfigurasi."}`);
    } catch(error) { setMessage(error instanceof Error ? error.message : "QRIS tidak terbaca"); }
    finally { setPending(false); }
  }
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function send(body: unknown) {
    const response = await fetch("/api/v1/admin/payment-evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.success)
      throw new Error(
        data.error?.message || "Perubahan belum tersimpan. Coba lagi.",
      );
    return data.data;
  }
  async function perform(body: unknown) {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const result = await send(body);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      if (result.otpRequired) {
        setMessage("OTP diminta ke nomor merchant. Masukkan di formulir verifikasi dalam lima menit.");router.refresh();
      } else if(result.authenticated) {
        setMessage(`Akun terhubung: ${result.merchantName || "merchant terverifikasi"}. Periksa QRIS sebelum aktivasi checkout.`);router.refresh();
      } else if (result.reconciled) {
        setMessage(`${result.settled || 0} pembayaran dikonfirmasi otomatis; ${result.reviewed} hasil memerlukan pemeriksaan.`); router.refresh();
      } else if (result.reviewOnly) {
        setMessage(
          `${result.count} email diperiksa. ${result.limited ? "Masih ada halaman berikutnya; baca lagi setelah satu menit." : "Pembacaan selesai."} Worker mencocokkan pembayaran pada rekening yang diaktifkan.`,
        );
        router.refresh();
      } else if (result.disconnected && result.kind === "GOPAY_QRIS") {
        setMessage("Sesi GoPay lokal dihapus dan checkout dihentikan. Pencabutan sesi di provider tidak diklaim; kelola perangkat/sesi juga dari akun merchant.");router.refresh();
      } else if (result.connectionChecked) {
        setMessage(`Koneksi merchant ${result.merchantName} terverifikasi. Periksa QRIS lalu aktifkan checkout.`);router.refresh();
      } else if (result.disconnected && !result.remoteRevoked)
        setMessage(
          "Koneksi lokal diputus. Cabut juga akses Hubify dari halaman Keamanan Akun Google karena pencabutan jarak jauh belum terkonfirmasi.",
        );
      else window.location.reload();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Permintaan gagal. Coba lagi.",
      );
    } finally {
      setPending(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void perform({
      action: "create",
      input: {
        kind,
        label: form.get("label"),
        accountRef: form.get("accountRef"),
        ...(kind === "GOPAY_QRIS"
          ? { staticQris: form.get("staticQris") }
          : {}),
      },
    });
  }
  const button =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="space-y-5" aria-busy={pending}>
      {kind === "GMAIL_BANK" && sources.some(s => s.connected) && <Link href="/admin/payments/evidence/test" className={`${button} bg-black !text-white`}>Uji transfer blu</Link>}
      <p role="status" aria-live="polite" className="text-sm text-zinc-700">
        {pending && (
          <Loader2
            size={16}
            className="mr-2 inline animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        {message ||
          (pending
            ? "Memproses…"
            : sources.some(s => s.enabled) ? "Pembacaan otomatis dan checkout aktif untuk rekening yang dipilih. Hasil tidak pasti tetap diperiksa seller."
            : "Konfigurasi draf tidak mengaktifkan pembayaran di checkout.")}
      </p>
      {sources.map((s) => (
        <section className="settings-card space-y-3" key={s.id}>
          <h2 className="!mb-0">{s.label}</h2>
          <p className="text-sm">
            {healthLabels[s.health] || "Perlu pemeriksaan operator"}
            {s.enabled ? " · Pembacaan otomatis aktif" : " · Checkout nonaktif"}
          </p>
          {s.readiness && <p role="status" className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">{s.readiness.reason}</p>}
          {s.merchant && <p className="text-sm">{s.merchant.merchantName||"Identitas merchant belum diperiksa"} · ID {s.merchant.merchantId||"belum tersedia"} · akun ••••{s.merchant.phoneSuffix}</p>}
          {kind === "GOPAY_QRIS" && canManage && <div className="space-y-3 rounded-xl bg-zinc-50 p-3">
            {s.qrisConfigured && <img src={`/api/v1/admin/payment-evidence/qris-image?sourceId=${encodeURIComponent(s.id)}&v=${encodeURIComponent(s.qrisVersion||"")}`} alt="Preview QRIS statis merchant" className="mx-auto aspect-square w-56 max-w-full rounded-xl bg-white" />}
            <label className="block space-y-2 text-sm"><span>{s.qrisConfigured?"Ganti gambar QRIS":"Unggah QRIS merchant"}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={event=>void uploadQris(event.target.files?.[0],s.id)} /></label>
            {s.qrisConfigured && <button type="button" className={button} disabled={pending} onClick={()=>void perform({action:"set-gopay-qris",sourceId:s.id,payload:null})}>Hapus QRIS konfigurasi</button>}
            <p className="text-sm">Integrasi tidak resmi. OTP menghubungkan sesi akun; aktivasi menunggu verifikasi merchant dan kontrak sesi.</p>
            <form className="flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void perform({action:"gopay-request-otp",sourceId:s.id,phone:form.get("phone")});}}>
              <label className="grow text-sm">Nomor GoBiz/merchant<input name="phone" type="tel" autoComplete="tel" required pattern="\\+?62[0-9]{8,13}" maxLength={17} placeholder="6281234567890" className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white p-3" /></label>
              <button className={button} disabled={pending}>Kirim OTP</button>
            </form>
            <button type="button" className={button} disabled={pending} onClick={()=>void perform({action:"gopay-check-connection",sourceId:s.id})}>Periksa koneksi merchant</button>
            <form className="flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void perform({action:"gopay-verify-otp",sourceId:s.id,otp:form.get("otp")});event.currentTarget.reset();}}>
              <label className="grow text-sm">Kode OTP<input name="otp" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{4,8}" maxLength={8} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white p-3" /></label>
              <button className={button+" bg-black !text-white"} disabled={pending}>Verifikasi OTP</button>
            </form>
            <form className="space-y-3" onSubmit={event=>{event.preventDefault();void perform({action:"set-gopay-enabled",sourceId:s.id,enabled:!s.enabled,ownershipConfirmed:true});}}>
              {!s.enabled && <label className="flex items-start gap-3 text-sm"><input type="checkbox" required disabled={pending || !goPayCheckoutAvailable} className="mt-1 size-4 accent-black" /><span>Saya memastikan QRIS ini milik merchant yang terhubung. Pembayaran akan dicocokkan otomatis dengan nominal berkode unik dan mutasi masuk berhasil.</span></label>}
              <button className={button+" bg-black !text-white"} disabled={pending || (!s.enabled && (!goPayCheckoutAvailable || s.health!=="MERCHANT_CONNECTED"))}>{s.enabled?"Nonaktifkan checkout QRIS":"Aktifkan checkout QRIS"}</button>
              {!goPayCheckoutAvailable && <p className="text-sm">Operator belum membuka checkout QRIS pada instalasi ini.</p>}
            </form>
          </div>}
          {canManage && kind === "GMAIL_BANK" && (
            <form className="space-y-3 rounded-xl bg-zinc-50 p-3" onSubmit={event => {
              event.preventDefault(); void perform({ action: "set-blu-enabled", sourceId: s.id, enabled: !s.enabled });
            }}>
              {!s.enabled && <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" required className="mt-1 size-4 shrink-0 accent-black" disabled={pending || !bluCheckoutAvailable} />
                <span>Aktifkan pembayaran otomatis berdasarkan notifikasi dana masuk blu yang tervalidasi, rekening sesuai, dan nominal berkode unik yang cocok tepat satu tagihan. Konflik dan pembayaran terlambat tetap diperiksa terpisah.</span>
              </label>}
              <button className={button + " bg-black !text-white"} disabled={pending || (!s.enabled && (!bluCheckoutAvailable || !s.connected))}>
                {s.enabled ? "Nonaktifkan checkout blu" : "Aktifkan checkout blu"}
              </button>
              {!bluCheckoutAvailable && !s.enabled && <p className="text-xs text-zinc-600">Operator belum membuka checkout blu untuk instalasi ini. Gmail tetap dapat dibaca untuk pemeriksaan.</p>}
            </form>
          )}
          <p className="text-xs text-zinc-500">
            Pemeriksaan terakhir:{" "}
            {s.lastCheckedAt
              ? new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Jakarta",
                }).format(new Date(s.lastCheckedAt)) + " WIB"
              : "Belum pernah"}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {kind === "GMAIL_BANK" && (
                <button
                  className={button + " bg-black !text-white"}
                  disabled={pending || !oauthEnabled}
                  onClick={() =>
                    void perform({ action: "connect-google", sourceId: s.id })
                  }
                >
                  <Mail size={16} aria-hidden="true" />
                  {s.connected ? "Hubungkan ulang Google" : "Hubungkan Google"}
                </button>
              )}
              {kind === "GMAIL_BANK" && <button type="button" className={button} disabled={pending}
                onClick={() => void perform({ action: "recheck-blu", sourceId: s.id })}>Periksa kandidat tersimpan</button>}
              {s.connected && (
                <>
                  {kind === "GMAIL_BANK" && (
                    <button
                      className={button}
                      disabled={pending || !oauthEnabled}
                      onClick={() =>
                        void perform({ action: "read-google", sourceId: s.id })
                      }
                    >
                      <RefreshCw size={16} aria-hidden="true" />
                      Baca notifikasi blu
                    </button>
                  )}
                  <button
                    className={button}
                    disabled={pending}
                    onClick={() =>
                      void perform({ action: "disconnect", sourceId: s.id })
                    }
                  >
                    <Unplug size={16} aria-hidden="true" />
                    Putuskan koneksi
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      ))}
      {kind === "GMAIL_BANK" && (
        <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
          Pembacaan manual hanya mencari notifikasi blu dalam 24 jam terakhir,
          hingga lima email per halaman. Lanjutkan halaman berikutnya setelah
          jeda satu menit. Nominal dan waktu adalah kandidat pencocokan, bukan
          bukti pasti asal dana atau konfirmasi lunas.{" "}
          <Link
            href="/admin/payments/evidence"
            className="font-medium text-zinc-950 underline underline-offset-4"
          >
            Lihat hasil pemeriksaan
          </Link>
        </p>
      )}
      {canManage && (
        <form onSubmit={create} className="settings-card space-y-4">
          <h2 className="!mb-0">Simpan konfigurasi draf</h2>
          <label className="block space-y-2 text-sm">
            <span>Nama koneksi</span>
            <input
              name="label"
              required
              minLength={2}
              maxLength={80}
              className="w-full rounded-xl border border-zinc-200 p-3"
              placeholder={
                kind === "GOPAY_QRIS" ? "QRIS toko" : "Notifikasi rekening toko"
              }
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>
              {kind === "GOPAY_QRIS"
                ? "ID merchant (opsional; diverifikasi setelah OTP)"
                : "Rekening penerima"}
            </span>
            {kind === "GOPAY_QRIS" ? (
              <input
                name="accountRef"
                maxLength={100}
                className="w-full rounded-xl border border-zinc-200 p-3"
                autoComplete="off"
              />
            ) : (
              <select
                name="accountRef"
                required
                className="w-full rounded-xl border border-zinc-200 p-3"
              >
                <option value="">Pilih rekening aktif</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            )}
          </label>
          {kind === "GOPAY_QRIS" && (
            <label className="block space-y-2 text-sm">
              <span>Gambar atau teks QRIS statis</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={event => void uploadQris(event.target.files?.[0])} className="block w-full text-sm" aria-label="Unggah gambar QRIS" />
              <textarea
                name="staticQris"
                value={qrisPayload}
                onChange={event=>setQrisPayload(event.target.value)}
                rows={4}
                required
                maxLength={4096}
                autoComplete="off"
                spellCheck={false}
                className="w-full resize-y rounded-xl border border-zinc-200 p-3 font-mono text-xs"
              />
              <span className="block text-xs text-zinc-500">
                PNG, JPEG, WebP maksimal 4 MB. Checksum, mata uang dan identitas merchant diperiksa sebelum disimpan.
              </span>
            </label>
          )}
          <button
            className={button + " bg-black !text-white"}
            disabled={pending || (kind === "GMAIL_BANK" && !banks.length)}
          >
            <LockKeyhole size={16} aria-hidden="true" />
            Simpan draf · tetap nonaktif
          </button>
        </form>
      )}
    </div>
  );
}
