"use client";
import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "@/modules/application-updates/service";

const labels: Record<UpdateStatus["status"], string> = {
  not_checked: "Belum diperiksa", no_release: "Belum ada rilis stabil resmi", current: "Aplikasi sudah menggunakan versi terbaru",
  available: "Pembaruan tersedia", ahead: "Versi aktif lebih baru daripada rilis stabil",
};
export function ApplicationUpdates({ initial }: { initial: UpdateStatus }) {
  const [status, setStatus] = useState(initial), [checking, setChecking] = useState(false), [error, setError] = useState("");
  async function check() {
    setChecking(true); setError("");
    try {
      const response = await fetch("/api/v1/admin/application-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw Error(result.error?.message || "Pemeriksaan belum berhasil");
      setStatus(result.data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Pemeriksaan terputus. Coba lagi."); }
    finally { setChecking(false); }
  }
  return <div className="mx-auto max-w-4xl space-y-7" data-testid="application-updates">
    <div><nav aria-label="Lokasi pengaturan" className="mb-2 text-sm text-zinc-600">Pengaturan</nav><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pembaruan Aplikasi</h1><p className="mt-3 max-w-prose text-sm leading-6 text-zinc-600">Periksa rilis resmi untuk toko ini. Kamu menentukan kapan pembaruan dipasang.</p></div>
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7" aria-label="Versi aplikasi">
      <dl className="divide-y divide-zinc-100 text-sm">
        <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-zinc-600">Versi terpasang</dt><dd className="font-semibold tabular-nums" data-testid="installed-version">v{status.installedVersion}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-zinc-600">Rilis stabil terbaru</dt><dd className="font-semibold tabular-nums" data-testid="latest-version">{status.release ? `v${status.release.version}` : "Belum tersedia / belum diperiksa"}</dd></div>
        <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-zinc-600">Status</dt><dd className="max-w-full font-medium" role="status" data-testid="update-status">{checking ? "Memeriksa GitHub Releases…" : labels[status.status]}</dd></div>
        {status.release && <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-zinc-600">Tanggal rilis</dt><dd>{new Date(status.release.publishedAt).toLocaleDateString("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" })}</dd></div>}
      </dl>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-4"><button type="button" disabled={checking} onClick={check} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-700 disabled:cursor-wait disabled:opacity-60"><RefreshCw size={16} className={checking ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />{checking ? "Sedang memeriksa…" : "Periksa Pembaruan"}</button>{status.checkedAt && <p className="text-xs text-zinc-600">Terakhir diperiksa: {new Date(status.checkedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}</div>
    </section>
    {status.release && <section className="space-y-3" aria-labelledby="release-notes"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="release-notes" className="text-lg font-semibold">Catatan rilis v{status.release.version}</h2><a href={status.release.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4">Lihat di GitHub <ExternalLink size={15} aria-hidden="true" /></a></div><p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-white p-5 text-sm leading-7 text-zinc-700">{status.release.notes || "Tidak ada catatan rilis."}</p></section>}
    <section className="space-y-4 border-t border-zinc-200 pt-6" aria-labelledby="update-installation"><h2 id="update-installation" className="text-lg font-semibold">Pemasangan melalui terminal VPS</h2><p className="max-w-prose text-sm leading-6 text-zinc-700">Identitas repository, tag, commit dan digest metadata diperiksa melalui GitHub. Kompatibilitas database dan isi paket harus diperiksa oleh updater lokal sebelum pemasangan.</p><p className="max-w-prose text-sm leading-6 text-zinc-700">Update satu klik belum diaktifkan. Jalankan perintah berikut di terminal VPS. Updater akan memverifikasi paket, membuat backup, dan meminta konfirmasi sebelum toko dihentikan sementara.</p><pre className="overflow-x-auto rounded-xl bg-zinc-950 p-5 text-sm leading-7 text-zinc-100"><code>sudo bash /opt/single-store/manager/update.sh --check{status.status === "available" && status.release ? `\nsudo bash /opt/single-store/manager/update.sh --apply --version ${status.release.version}` : ""}</code></pre><p className="max-w-prose text-sm leading-6 text-zinc-600">Jika aktivasi gagal, updater dapat memulihkan kode/container sebelumnya untuk migrasi kompatibel. Perubahan skema additive tetap ada; pemulihan database penuh memerlukan tindakan operator.</p></section>
  </div>;
}
