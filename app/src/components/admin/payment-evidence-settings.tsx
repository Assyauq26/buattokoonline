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
  lastCheckedAt: string | null;
}
const healthLabels: Record<string, string> = {
  NOT_CONNECTED: "Belum terhubung",
  DISCONNECTED: "Terputus",
  CONNECTED_PARSER_BLOCKED: "Gmail terhubung · menunggu pembacaan manual",
  RECONNECT_REQUIRED: "Hubungkan ulang",
  REVIEW_ONLY: "Hanya pemeriksaan seller",
  TEMPORARILY_UNAVAILABLE: "Sementara tidak tersedia",
};
export function PaymentEvidenceSettings({
  kind,
  sources,
  banks,
  canManage,
  oauthEnabled,
}: {
  kind: "GOPAY_QRIS" | "GMAIL_BANK";
  sources: Source[];
  banks: Array<{ id: string; label: string }>;
  canManage: boolean;
  oauthEnabled: boolean;
}) {
  const router = useRouter();
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
      if (result.reviewOnly) {
        setMessage(
          `${result.count} email diperiksa. ${result.limited ? "Masih ada halaman berikutnya; baca lagi setelah satu menit." : "Pembacaan selesai."} Semua hasil perlu pemeriksaan manual; pesanan tidak dilunasi.`,
        );
        router.refresh();
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
            : "Konfigurasi draf tidak mengaktifkan pembayaran di checkout.")}
      </p>
      {sources.map((s) => (
        <section className="settings-card space-y-3" key={s.id}>
          <h2 className="!mb-0">{s.label}</h2>
          <p className="text-sm">
            {healthLabels[s.health] || "Perlu pemeriksaan operator"}
          </p>
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
                ? "ID merchant (bukan token atau password)"
                : "Rekening penerima"}
            </span>
            {kind === "GOPAY_QRIS" ? (
              <input
                name="accountRef"
                required
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
              <span>Teks QRIS statis</span>
              <textarea
                name="staticQris"
                rows={4}
                required
                maxLength={4096}
                autoComplete="off"
                spellCheck={false}
                className="w-full resize-y rounded-xl border border-zinc-200 p-3 font-mono text-xs"
              />
              <span className="block text-xs text-zinc-500">
                Checksum dan identitas QR diperiksa sebelum disimpan. Unggah
                gambar belum didukung.
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
