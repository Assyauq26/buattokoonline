"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function BluReviewNote({ evidenceId }: { evidenceId: string }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null), router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget, values = new FormData(form);
    requestId.current ??= crypto.randomUUID(); setPending(true); setMessage("");
    try {
      const r = await fetch("/api/v1/admin/payment-evidence", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record-blu-review", input: { evidenceId, requestId: requestId.current,
          decision: values.get("decision"), reason: values.get("reason") } }) });
      const result = await r.json();
      if (!r.ok || !result.success) throw new Error(result.error?.message || "Catatan belum tersimpan.");
      requestId.current = null; form.reset(); setMessage("Catatan pemeriksaan tersimpan. Status pembayaran tidak berubah."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Catatan belum tersimpan. Coba lagi."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} aria-busy={pending} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
    <h2 className="font-semibold">Catat pemeriksaan terpisah</h2>
    <p className="text-sm text-zinc-600">Untuk hasil yang tidak cocok, ambigu, terlambat, atau memerlukan pengembalian. Catatan ini tidak melunasi pesanan dan tidak mengirim dana.</p>
    <label className="block space-y-2 text-sm"><span>Hasil pemeriksaan</span><select name="decision" disabled={pending} className="min-h-11 w-full rounded-xl border border-zinc-200 p-3">
      <option value="NEEDS_BANK_CHECK">Perlu memeriksa mutasi bank</option><option value="UNMATCHED">Belum ada pesanan yang cocok</option>
      <option value="AMBIGUOUS">Beberapa kandidat atau kemungkinan duplikat</option><option value="LATE">Pembayaran terlambat atau pesanan ditutup</option>
      <option value="REFUND_REQUIRED">Perlu pemeriksaan pengembalian dana</option><option value="NOT_A_PAYMENT">Bukan pembayaran masuk yang dapat digunakan</option>
    </select></label>
    <label className="block space-y-2 text-sm"><span>Catatan seller</span><textarea name="reason" required disabled={pending} minLength={15} maxLength={1000} rows={3}
      className="w-full rounded-xl border border-zinc-200 p-3" placeholder="Catat temuan dan tindak lanjut. Jangan masukkan token atau isi email lengkap." /></label>
    <button disabled={pending} className="min-h-11 rounded-xl bg-black px-4 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50">{pending ? "Menyimpan…" : "Simpan catatan pemeriksaan"}</button>
    <p role="status" aria-live="polite" className="text-sm text-zinc-600">{message}</p>
  </form>;
}
