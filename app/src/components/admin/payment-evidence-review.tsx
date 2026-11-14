"use client";
import { useState, type FormEvent } from "react";

export function PaymentEvidenceReview({
  evidenceId,
  candidates,
}: {
  evidenceId: string;
  candidates: Array<{ id: string; orderNumber: string; payable: number }>;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/payment-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          evidenceId,
          attemptId: form.get("attemptId"),
          reason: form.get("reason"),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(
          result.error?.message || "Pemeriksaan belum tersimpan.",
        );
      setMessage(
        "Bukti sudah dikaitkan. Pesanan belum dinyatakan lunas; verifikasi pembayaran tetap dilakukan melalui alur pembayaran manual.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Permintaan gagal. Coba lagi.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="settings-card space-y-4"
      aria-busy={pending}
    >
      <h2 className="!mb-0">Catat pemeriksaan seller</h2>
      <p className="text-sm text-zinc-600">
        Daftar ini hanya berdasarkan nominal dan waktu. Cocokkan identitas
        pembeli dan transaksi di sumber asli secara terpisah. Jangan memilih
        pesanan jika masih ambigu.
      </p>
      <label className="block space-y-2 text-sm">
        <span>Pesanan yang sudah Anda periksa</span>
        <select
          className="w-full rounded-xl border border-zinc-200 p-3"
          name="attemptId"
          required
          disabled={pending || !candidates.length}
        >
          <option value="">Pilih pesanan</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.orderNumber} · Rp{c.payable.toLocaleString("id-ID")}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2 text-sm">
        <span>Dasar pemeriksaan</span>
        <textarea
          className="w-full rounded-xl border border-zinc-200 p-3"
          rows={4}
          name="reason"
          required
          minLength={15}
          maxLength={1000}
          placeholder="Catat hasil pemeriksaan mutasi dan identitas pembeli. Jangan tulis token atau data rekening lengkap."
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input className="mt-1 size-4 accent-black" type="checkbox" required />
        <span>
          Saya sudah memeriksa transaksi asli dan hubungan dengan pembeli, bukan
          hanya nominal dan waktu.
        </span>
      </label>
      <button
        disabled={pending || !candidates.length}
        className="min-h-11 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Kaitkan bukti · belum lunas"}
      </button>
      <p className="text-sm text-zinc-700" role="status" aria-live="polite">
        {message ||
          (!candidates.length
            ? "Tidak ada pesanan yang memenuhi syarat. Jangan paksa klaim transaksi terlambat atau berbeda nominal."
            : "")}
      </p>
    </form>
  );
}
