"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Clock } from "lucide-react";
import { formatIDR } from "@/lib/money";

export function BluPaymentStatus({ orderId, accountNumber, amount, uniqueCode, expiresAt, initialStatus, serverNow }: {
  orderId: string; accountNumber: string; amount: number; uniqueCode: number; expiresAt: string;
  initialStatus: string; serverNow: string;
}) {
  const router = useRouter(), [message, setMessage] = useState(""), [status, setStatus] = useState(initialStatus);
  const [now, setNow] = useState(+new Date(serverNow));
  useEffect(() => {
    let offset = +new Date(serverNow) - Date.now(), busy = false, stopped = false;
    const controller = new AbortController();
    const clock = setInterval(() => setNow(Date.now() + offset), 1000);
    async function poll() {
      if (busy || document.hidden || stopped) return;
      busy = true;
      try {
        const r = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/payment-state`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        const body = await r.json();
        if (!r.ok || !body.success) throw new Error("status_unavailable");
        offset = +new Date(body.data.serverNow) - Date.now();
        setStatus(body.data.paymentStatus);
        if (body.data.paymentStatus !== initialStatus || ["CANCELLED", "EXPIRED", "REFUNDED"].includes(body.data.status)) router.refresh();
        if (["PAID", "REFUNDED", "EXPIRED"].includes(body.data.paymentStatus) || ["CANCELLED", "EXPIRED"].includes(body.data.status)) stopped = true;
      } catch { if (!controller.signal.aborted) setMessage("Pembaruan status tertunda. Muat ulang untuk memeriksa kembali."); }
      finally { busy = false; }
    }
    const timer = setInterval(() => void poll(), 10000);
    return () => { stopped = true; controller.abort(); clearInterval(clock); clearInterval(timer); };
  }, [orderId, initialStatus, serverNow, router]);
  const [checking, setChecking] = useState(false);
  async function checkPayment() {
    if (checking) return; setChecking(true);
    try {
      const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/payment-state`, { method: "POST", signal: AbortSignal.timeout(25000) });
      const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error?.message || "Pemeriksaan tertunda");
      setStatus(body.data.paymentStatus); setMessage(body.data.paymentStatus === "PAID" ? "Pembayaran berhasil." : "Belum ada pembayaran cocok. Pemeriksaan otomatis tetap berjalan."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pemeriksaan tertunda"); }
    finally { setChecking(false); }
  }
  const remaining = Math.max(0, Math.ceil((+new Date(expiresAt) - now) / 1000));
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label} disalin.`); }
    catch { setMessage("Belum dapat menyalin. Pilih dan salin teks secara manual."); }
  }
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black motion-safe:active:scale-[0.98]";
  return <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4" aria-label="Status transfer blu">
    <h2 className="font-semibold">{accountNumber ? "Transfer blu" : "QRIS"} · nominal harus tepat</h2>
    <p className="text-sm text-zinc-600">{formatIDR(amount - uniqueCode)} + kode unik {formatIDR(uniqueCode)} = <strong className="text-zinc-950">{formatIDR(amount)}</strong></p>
    <p className="flex items-center gap-2 text-sm tabular-nums"><Clock size={16} aria-hidden="true" />
      {remaining ? `Sisa waktu ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Waktu transfer berakhir. Jangan melakukan transfer baru."}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => void copy(String(amount), "Nominal")}><Copy size={16} aria-hidden="true" />Salin nominal</button>
      {accountNumber && <button type="button" className={button} onClick={() => void copy(accountNumber, "Rekening")}><Copy size={16} aria-hidden="true" />Salin rekening</button>}
      <button type="button" className={button} disabled={checking || status === "PAID" || !remaining} onClick={() => void checkPayment()}>{checking ? "Memeriksa…" : "Cek pembayaran"}</button>
    </div>
    <p className="text-sm text-zinc-600">{status === "PAID" ? "Pembayaran berhasil dikonfirmasi." : status === "WAITING_VERIFICATION" ? "Konfirmasi pembayaran masih tertunda. Jangan transfer ulang."
      : "Notifikasi dibaca otomatis oleh toko meskipun halaman ditutup. Pembayaran dikonfirmasi otomatis setelah notifikasi dana masuk tervalidasi cocok dengan tagihan."}</p>
    <p role="status" aria-live="polite" className="text-sm text-zinc-600">{message}</p>
  </section>;
}
