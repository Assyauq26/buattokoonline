"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { formatIDR } from "@/lib/money";
type View = { amount: number; status: string; orderStatus: string; serverNow: string; attempts: Array<{
  id: string; providerOrderId: string; state: string; providerStatus: string | null; channel: string | null;
  transactionId: string | null; expiresAt: string; lastCheckedAt: string | null; lastError: string | null;
}> };
type SnapWindow = Window & { snap?: { pay: (token: string, callbacks: Record<string, () => void>) => void } };
export function MidtransPayment({ orderId, initial, staff = false }: { orderId: string; initial: View; staff?: boolean }) {
  const [view, setView] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [remaining, setRemaining] = useState(0);
  const offset = useRef(Date.parse(initial.serverNow) - Date.now());
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try { const response = await fetch(`/api/v1/orders/${orderId}/midtrans${staff ? "?staff=1" : ""}`, { cache: "no-store" });
      const body = await response.json(); if (response.ok && mounted.current) { setView(body.data); offset.current = Date.parse(body.data.serverNow) - Date.now(); } }
    catch { /* Leave the last server state visible; no invented success. */ }
  }, [orderId, staff]);
  useEffect(() => { mounted.current = true; const timer = setInterval(refresh, 10_000); return () => { mounted.current = false; clearInterval(timer); }; }, [refresh]);
  const current = view.attempts[0];
  useEffect(() => { const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(current?.expiresAt || "") - Date.now() - offset.current) / 1000)) || 0);
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [current?.expiresAt]);
  async function act(action: "open" | "check") {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/midtrans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, staff }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Pembayaran belum dapat diperiksa.");
      if (action === "check") { setMessage(result.data.check?.deferred ? "Pemeriksaan tertunda atau cooldown aktif. Worker tetap memeriksa otomatis." : "Status diperiksa melalui backend Midtrans."); await refresh(); return; }
      const { token, clientKey, environment, redirectUrl: url } = result.data;
      setRedirectUrl(url);
      const src = environment === "sandbox" ? "https://app.sandbox.midtrans.com/snap/snap.js" : "https://app.midtrans.com/snap/snap.js";
      const old = document.querySelector<HTMLScriptElement>("script[data-hubify-snap]");
      if (old && (old.src !== src || old.dataset.clientKey !== clientKey)) { old.remove(); delete (window as SnapWindow).snap; }
      if (!(window as SnapWindow).snap) await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script"); script.src = src; script.dataset.clientKey = clientKey; script.dataset.hubifySnap = "true";
        script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("Popup belum terbuka. Gunakan Buka halaman pembayaran.")); }; document.body.appendChild(script);
      });
      const snap = (window as SnapWindow).snap;
      if (!snap) throw new Error("Popup tidak tersedia. Gunakan halaman pembayaran resmi di bawah.");
      const changed = () => { void refresh(); setMessage("Status akhir dikonfirmasi backend. Jangan membayar ulang jika dana telah terpotong."); };
      snap.pay(token, { onSuccess: changed, onPending: changed, onError: changed,
        onClose: () => { void refresh(); setMessage("Popup ditutup. Pesanan tetap tersimpan; Anda dapat melanjutkan pembayaran."); } });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan tertunda."); }
    finally { setBusy(false); }
  }
  const paid = view.status === "PAID", closed = !["PENDING_PAYMENT"].includes(view.orderStatus);
  return <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5" aria-label="Pembayaran Midtrans">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-zinc-500">Midtrans · {paid ? "Lunas" : current?.providerStatus || "Menunggu pembayaran"}</p>
      <h2 className="mt-1 text-3xl font-bold tabular-nums">{formatIDR(view.amount)}</h2></div><ShieldCheck size={24} aria-hidden="true" /></div>
    {paid ? <p>Pembayaran telah dikonfirmasi backend. Pesanan diteruskan ke toko.</p> : <>
      <p className="text-sm text-zinc-600">Pilih QRIS, e-wallet, atau bank yang tersedia melalui Snap. Tanpa kode unik dan tanpa unggah bukti.</p>
      <p className="text-sm">Batas pembayaran: <strong className="tabular-nums">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong></p>
      {!remaining && <p className="rounded-xl bg-zinc-100 p-3 text-sm">Batas aplikasi telah lewat. Jangan membayar lagi. Sistem memeriksa provider sebelum menutup pesanan dan melepas stok.</p>}
      {!staff && !closed && remaining > 0 && <button disabled={busy || !["NEW", "PENDING", "TERMINAL"].includes(current?.state || "") || (current?.state !== "PENDING" && remaining < 300)} onClick={() => void act("open")}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-4 font-semibold text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{busy ? "Memproses…" : current?.state === "NEW" ? "Bayar sekarang" : current?.state === "TERMINAL" ? "Mulai percobaan baru" : "Lanjutkan pembayaran"}</button>}
      {redirectUrl && !closed && remaining > 0 && <a href={redirectUrl} rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm">Buka halaman pembayaran <ExternalLink size={16} /></a>}
    </>}
    <button disabled={busy} onClick={() => void act("check")} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm disabled:opacity-40"><RefreshCw size={16} /> Cek pembayaran</button>
    <p role="status" aria-live="polite" className="text-sm text-zinc-600">{message || current?.lastError || "Status diperbarui otomatis meskipun halaman pembayaran ditutup."}</p>
    <div className="space-y-2 border-t border-zinc-200 pt-3 text-xs text-zinc-500"><p className="break-all">ID Midtrans: {current?.providerOrderId}</p>
      <p>Kanal: {current?.channel || "Belum dipilih"}</p><p>Pemeriksaan terakhir: {current?.lastCheckedAt ? new Date(current.lastCheckedAt).toLocaleString("id-ID") : "Belum diperiksa"}</p></div>
    <Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href={staff ? `/admin/orders/${orderId}` : `/orders/${orderId}`}>Lihat detail pesanan</Link>
  </section>;
}
