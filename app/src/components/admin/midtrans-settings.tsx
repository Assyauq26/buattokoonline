"use client";
import { useState } from "react";
import { Copy, LockKeyhole, ExternalLink } from "lucide-react";
type Settings = { enabled: boolean; environment: string; merchantId: string; configured: boolean; clientKeyStored: boolean; serverKeyStored: boolean;
  lastCheckedAt: string | null; lastError: string | null; encryptionReady: boolean; notificationUrl: string; finishUrl: string };
export function MidtransSettings({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage(""); const form = event.currentTarget, data = new FormData(form);
    try { const response = await fetch("/api/v1/admin/midtrans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      environment: data.get("environment"), merchantId: data.get("merchantId"), clientKey: data.get("clientKey"), serverKey: data.get("serverKey"), enabled: data.get("enabled") === "on" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Konfigurasi belum tersimpan.");
      (form.elements.namedItem("serverKey") as HTMLInputElement).value = ""; (form.elements.namedItem("clientKey") as HTMLInputElement).value = "";
      const refreshed = await fetch("/api/v1/admin/midtrans", { cache: "no-store" }); if (refreshed.ok) setSettings((await refreshed.json()).data);
      setMessage(body.data.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Konfigurasi belum tersimpan."); } finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <section className="settings-card space-y-3"><div className="flex items-center gap-2 font-semibold"><LockKeyhole size={20} />{settings.configured ? "Konfigurasi tersimpan" : "Belum dikonfigurasi"}</div>
      <p className="text-sm text-zinc-600">{settings.enabled ? "Diaktifkan seller. Checkout umum hanya menampilkan konfigurasi Production." : "Belum ditawarkan pada checkout."} Keabsahan kredensial akan diperiksa pada permintaan transaksi pertama, bukan dari format key.</p>
      <p className="text-xs text-zinc-500">Sinkronisasi terakhir: {settings.lastCheckedAt ? new Date(settings.lastCheckedAt).toLocaleString("id-ID") : "Belum ada transaksi yang diperiksa"}</p>
      {settings.lastError && <p className="text-sm">{settings.lastError}</p>}
    </section>
    <form onSubmit={submit} className="settings-card space-y-5" autoComplete="off">
      <label className="flex min-h-11 items-center justify-between gap-4"><span><strong>Aktifkan Midtrans</strong><span className="block text-sm text-zinc-600">Pesanan baru memakai nominal asli tanpa kode unik.</span></span><input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="size-5 accent-black" /></label>
      <label className="block space-y-2 text-sm font-medium">Environment<select name="environment" defaultValue={settings.environment} className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3"><option value="production">Production · dana nyata</option><option value="sandbox">Sandbox · tidak tampil di checkout umum</option></select></label>
      <p className="text-sm text-zinc-600">Pilih Production untuk pembayaran live. Key Sandbox berbeda dengan Production. Perubahan merchant/environment memerlukan kedua key baru.</p>
      <label className="block space-y-2 text-sm font-medium">Merchant ID<input name="merchantId" defaultValue={settings.merchantId} required maxLength={100} className="min-h-11 w-full rounded-xl border border-zinc-300 px-3" /></label>
      <label className="block space-y-2 text-sm font-medium">Client Key<input name="clientKey" type="password" autoComplete="new-password" maxLength={256} placeholder={settings.clientKeyStored ? "Tersimpan · kosongkan untuk mempertahankan" : "Client Key dari Midtrans"} className="min-h-11 w-full rounded-xl border border-zinc-300 px-3" /></label>
      <label className="block space-y-2 text-sm font-medium">Server Key<input name="serverKey" type="password" autoComplete="new-password" maxLength={256} placeholder={settings.serverKeyStored ? "Tersimpan terenkripsi · kosongkan untuk mempertahankan" : "Server Key dari Midtrans"} className="min-h-11 w-full rounded-xl border border-zinc-300 px-3" /></label>
      <p className="text-sm text-zinc-600">Isi key langsung di halaman ini. Jangan kirim key melalui chat. Versi konfigurasi lama tetap disimpan untuk memeriksa pembayaran yang telah diterbitkan.</p>
      {!settings.encryptionReady && <p role="alert">Kunci enkripsi integrasi belum tersedia pada server. Hubungi operator sebelum menyimpan konfigurasi.</p>}
      <button disabled={busy || !settings.encryptionReady} className="min-h-12 w-full rounded-xl bg-black px-5 font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Simpan konfigurasi"}</button>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </form>
    <section className="settings-card space-y-5"><h2>Hubungkan dashboard Midtrans</h2><p className="text-sm text-zinc-600">Buka Midtrans Production → Settings → Access Keys. Salin ketiga nilai ke field di atas, lalu simpan. Di Settings → Configuration, isi URL berikut.</p>
      {[["Payment Notification URL", settings.notificationUrl], ["Finish Redirect URL", settings.finishUrl]].map(([label, url]) => <div key={label}><strong className="text-sm">{label}</strong><code className="my-2 block break-all rounded-xl bg-zinc-100 p-3 text-xs">{url}</code><button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage(`${label} disalin.`)).catch(() => setMessage("Salin URL secara manual."))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm"><Copy size={16} />Salin URL</button></div>)}
      <p className="text-sm text-zinc-600">Notification URL menerima webhook backend; Finish Redirect hanya mengembalikan pembeli. Kanal yang tersedia mengikuti aktivasi merchant pada Midtrans, tanpa daftar kanal paksa dari Hubify.</p>
      <a href="https://dashboard.midtrans.com" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm underline">Buka dashboard Midtrans<ExternalLink size={16} /></a>
    </section>
  </div>;
}
