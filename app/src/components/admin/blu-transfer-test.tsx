"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, RefreshCw, ShieldCheck, Clock } from "lucide-react";
import { formatIDR } from "@/lib/money";
import type { listBluTestOrders } from "@/modules/payments/evidence/test-orders";

type Test = Awaited<ReturnType<typeof listBluTestOrders>>[number];
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export function BluTransferTest({ initialTests, sources, serverNow }: {
  initialTests: Test[]; sources: { id: string; label: string }[]; serverNow: string;
}) {
  const [tests, setTests] = useState(initialTests);
  const [now, setNow] = useState(+new Date(serverNow));
  const clock = useRef({ server: +new Date(serverNow), local: Date.now() });
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const request = useRef<string | null>(null);
  const active = tests.some(t => !t.closed && +new Date(t.expiresAt) > now);
  async function refresh() {
    const response = await fetch("/api/v1/admin/payment-evidence", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error("Status belum diperbarui. Muat ulang halaman.");
    setTests(result.data.tests);
    clock.current = { server: +new Date(result.data.serverNow), local: Date.now() };
  }
  useEffect(() => {
    const ticker = setInterval(() => setNow(clock.current.server + Date.now() - clock.current.local), 1000);
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh().catch(() => {}); }, 10000);
    return () => { clearInterval(ticker); clearInterval(poll); };
  }, []);
  async function send(body: unknown) {
    const response = await fetch("/api/v1/admin/payment-evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error?.message || "Permintaan gagal. Coba lagi.");
    return result.data;
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    request.current ??= crypto.randomUUID();
    setPending(true); setMessage("");
    try {
      await send({ action: "create-test", input: { sourceId: form.get("sourceId"), requestId: request.current,
        baseAmount: Number(form.get("baseAmount")), windowMinutes: Number(form.get("windowMinutes")) } });
      await refresh(); request.current = null;
      setMessage("Pesanan uji diterbitkan. Periksa nominal dan rekening di bawah sebelum transfer.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Uji belum diterbitkan."); }
    finally { setPending(false); }
  }
  async function read(sourceId: string) {
    if (pending) return; setPending(true); setMessage("Membaca notifikasi blu…");
    try {
      const result = await send({ action: "read-google", sourceId });
      await refresh(); setMessage(`${result.count} email diperiksa. ${result.limited ? "Masih ada halaman berikutnya; baca lagi setelah satu menit." : "Pembacaan selesai."} Tidak ada pelunasan otomatis.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Pembacaan gagal."); }
    finally { setPending(false); }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setMessage("Salin manual dari angka yang ditampilkan."); }
  }
  return <div className="space-y-5" aria-busy={pending}>
    <p className="flex items-start gap-2 rounded-xl bg-zinc-100 p-4 text-sm leading-relaxed"><ShieldCheck size={20} className="shrink-0" />Uji ini menggunakan transfer uang nyata ke rekening Anda sendiri. Tidak membeli barang, mengurangi stok, melunasi pesanan, atau membuat pengiriman. Transfer yang dilakukan tidak otomatis dikembalikan.</p>
    <form onSubmit={create} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="font-semibold">1. Terbitkan pesanan uji</h2>
      {!sources.length ? <p className="text-sm">Hubungkan Gmail dan baca notifikasi terlebih dahulu melalui <Link className="underline" href="/admin/settings/payment-methods/gmail-bank">pengaturan blu</Link>.</p> : <>
        <label className="block text-sm">Rekening blu<select name="sourceId" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-200 px-3" disabled={pending || active}>{sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Nominal dasar (Rp)<input name="baseAmount" type="number" inputMode="numeric" min={1000} max={50000} step={1} defaultValue={1000} required disabled={pending || active} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-200 px-3" /></label>
          <label className="text-sm">Batas pembayaran<select name="windowMinutes" defaultValue="10" disabled={pending || active} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-200 px-3"><option value="10">10 menit</option><option value="5">5 menit</option></select></label></div>
        <p className="text-xs leading-relaxed text-zinc-600">Kode unik Rp1–Rp999 ditambahkan saat diterbitkan. Transfer hanya nominal akhir yang muncul. Satu uji aktif per admin dan rekening.</p>
        <button className={`${button} w-full bg-black !text-white sm:w-auto`} disabled={pending || active}>{pending && <Loader2 size={16} className="motion-safe:animate-spin" />} {active ? "Masih ada uji aktif" : "Terbitkan nominal uji"}</button>
      </>}
    </form>
    <p role="status" aria-live="polite" className="text-sm text-zinc-700">{message}</p>
    {tests.map((test, index) => {
      const remaining = Math.max(0, Math.ceil((+new Date(test.expiresAt) - now) / 1000));
      const matched = test.matches.length === 1, ambiguous = test.matches.length > 1;
      const open = !test.closed && remaining > 0;
      return <section key={test.id} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{index === 0 ? "2. Transfer & periksa" : "Riwayat uji"}</h2>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium">{ambiguous ? "Ambigu · periksa manual" : matched ? "Nominal & waktu cocok" : open ? "Menunggu transfer" : "Waktu habis · jangan transfer"}</span></div>
        <p className="break-all text-xs text-zinc-500">{test.orderNumber}</p>
        <div className="rounded-xl bg-zinc-50 p-4"><p className="text-sm">Total transfer tepat</p><p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatIDR(test.payable)}</p>
          <p className="mt-2 text-xs text-zinc-600">{formatIDR(test.baseAmount)} + kode unik {test.uniqueCode}</p>
          {open && <button type="button" className={`${button} mt-3`} onClick={() => void copy(String(test.payable), "nominal")}><Copy size={16} />{copied === "nominal" ? "Nominal disalin" : "Salin nominal"}</button>}</div>
        {test.bank && open && <div className="space-y-1 text-sm"><p>{test.bank.name} · a.n. {test.bank.holder}</p><p className="break-all font-semibold tabular-nums">{test.bank.number}</p><button type="button" className={button} onClick={() => void copy(test.bank!.number, "rekening")}><Copy size={16} />{copied === "rekening" ? "Rekening disalin" : "Salin rekening"}</button></div>}
        <p className="flex items-center gap-2 text-sm tabular-nums"><Clock size={16} />{open ? `Sisa ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Tenggat sudah berakhir"} · {new Date(test.expiresAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>
        {matched ? <p className="flex items-start gap-2 rounded-xl bg-zinc-100 p-3 text-sm"><Check size={18} className="shrink-0" />Email dengan nominal tepat dan waktu dalam tenggat ditemukan. Ini hasil uji pencocokan; pesanan tidak dilunasi. Jangan transfer ulang.</p> : <p className="text-sm leading-relaxed text-zinc-600">{open ? "Transfer dari aplikasi bank Anda sendiri. Setelah email blu masuk, tekan Baca email blu. Status di halaman ini diperbarui setiap 10 detik." : "Jangan transfer ke nominal uji ini. Email yang terlambat dibaca tetap diperiksa berdasarkan waktu transaksi, bukan waktu pembacaan. Jika dana sudah terkirim, periksa rekening; jangan membayar ulang."}</p>}
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={pending} onClick={() => void read(test.sourceId)}>{pending ? <Loader2 size={16} className="motion-safe:animate-spin" /> : <RefreshCw size={16} />}Baca email blu</button>
          {test.matches.map(id => <Link key={id} href={`/admin/payments/evidence/${id}`} className={button}>Lihat hasil pemeriksaan</Link>)}</div>
        <p className="text-xs leading-relaxed text-zinc-500">Pembacaan Gmail dibatasi satu kali per menit, lima email per halaman. Kecocokan nominal dan waktu tidak membuktikan identitas pengirim atau keaslian email.</p>
      </section>;
    })}
  </div>;
}
