"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
type Job = {
  id: string;
  state: string;
  version: string;
  updated: number;
  detail: {
    error?: string;
    downloaded?: number;
    total?: number;
    activeVersion?: string;
    finishedAt?: number;
  };
};
type Status = {
  installedVersion: string;
  checkedAt: number | null;
  catalogError: string | null;
  availability?: {
    state: "check_required" | "current" | "blocked" | "available";
    latest: { version: string; sha: string; notes: string } | null;
    reason: string | null;
    steps?: number;
  };
  release: { version: string; sha: string; notes: string } | null;
  jobs: Job[];
  statusToken?: string;
};
const stages = [
  "queued",
  "preflight",
  "downloading",
  "preparing",
  "backing_up",
  "migrating",
  "activating",
  "verifying",
];
const labels: Record<string, string> = {
  queued: "Menunggu giliran",
  preflight: "Memeriksa kesiapan toko",
  downloading: "Mengunduh pembaruan",
  preparing: "Menyiapkan aplikasi",
  backing_up: "Mencadangkan data toko",
  migrating: "Menyesuaikan data",
  activating: "Mengaktifkan pembaruan",
  verifying: "Memeriksa hasil",
  succeeded: "Update berhasil",
  failed: "Update belum berhasil",
  rolling_back: "Memulihkan versi sebelumnya",
  rolled_back: "Versi sebelumnya dipulihkan",
  recovery_required: "Perlu bantuan operator",
};
const errors: Record<string, string> = {
  carrier_work_pending: "Ada permintaan J&T yang belum selesai atau belum diketahui hasilnya. Operator perlu merekonsiliasinya sebelum update.",
  active_requests_pending: "Permintaan toko masih berjalan. Update ditahan agar transaksi tidak terputus.",
  proxy_review_required: "Konfigurasi akses toko perlu ditinjau operator agar route domain lain tetap terlindungi.",
  schema_drift: "Struktur database berbeda dari baseline yang didukung. Operator perlu memeriksa perbedaannya.",
  active_source_mismatch: "Aplikasi yang berjalan berbeda dari sumber rilis. Operator perlu memeriksa integritasnya.",
  installation_not_in_pilot: "Toko belum termasuk kelompok pemasangan yang disetujui. Hubungi operator untuk penjadwalan.",
  preflight_unavailable: "Pemeriksaan kesiapan server belum berhasil. Coba periksa lagi atau hubungi operator.",
  worker_upgrade_in_progress: "Peningkatan layanan updater belum selesai. Operator perlu menyelesaikan pemeriksaannya.",
  external_work_review_required: "Hasil pekerjaan server belum dapat dipastikan. Operator perlu memeriksanya sebelum pemulihan dilanjutkan.",
  worker_upgrade_required: "Operator perlu meningkatkan layanan updater satu kali sebelum versi ini dapat dipasang.",
  upgrade_path_unsupported: "Versi asal toko belum memiliki jalur upgrade yang disetujui. Hubungi operator untuk menentukan urutannya.",
  database_contract_unsupported: "Struktur data toko memerlukan pemeriksaan operator sebelum update.",
  operator_migration_required: "Versi ini memerlukan migrasi khusus. Operator perlu menyiapkan jalur upgrade dan recovery yang sesuai.",
  insufficient_disk: "Ruang penyimpanan belum cukup.",
  insufficient_resources: "Server sedang kekurangan sumber daya. Coba lagi setelah bebannya berkurang.",
  local_customization:
    "Ada perubahan khusus pada aplikasi yang perlu ditinjau operator.",
  migration_history: "Riwayat data perlu diperiksa operator.",
  updater_interrupted:
    "Layanan terhenti saat proses berjalan. Operator perlu memeriksa hasil sebelum melanjutkan.",
  migration_verification: "Penyesuaian data belum terverifikasi.",
  rollback_failed: "Pemulihan belum selesai. Hubungi operator.",
  maintenance_busy: "Pekerjaan toko masih berjalan. Coba lagi setelah selesai.",
  build_failed: "Aplikasi baru belum berhasil disiapkan.",
};
const active = (job?: Job) =>
  !!job && !["succeeded", "failed", "rolled_back"].includes(job.state);
const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("id-ID");

export function OneClickUpdate({
  installedVersion,
  enabled,
}: {
  installedVersion: string;
  enabled: boolean;
}) {
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [offline, setOffline] = useState(false);
  const token = useRef("");
  const key = useRef("");
  const keySha = useRef("");
  const pending = useRef(false);
  const renewAfter = useRef(0);
  const sessionExpired = useRef(false);
  const accept = useCallback((value: Status) => {
    if (value.statusToken) token.current = value.statusToken;
    setData(value);
    setOffline(false);
  }, []);
  const command = useCallback(
    async (action: "status" | "check" | "start", sha?: string) => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      setMessage("");
      if (action === "start" && (!key.current || keySha.current !== sha)) {
        key.current = crypto.randomUUID();
        keySha.current = sha ?? "";
      }
      try {
        const response = await fetch("/api/v1/admin/updater", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "start"
              ? { action, sha, requestKey: key.current }
              : { action },
          ),
          signal: AbortSignal.timeout(15000),
        });
        const result = await response.json();
        if (response.status === 401 || response.status === 403) {
          sessionExpired.current = true;
          token.current = "";
          throw new Error(
            "Sesi berakhir. Masuk kembali untuk melihat status update.",
          );
        }
        if (!response.ok || !result.success)
          throw new Error(
            result.error?.message ?? "Permintaan belum berhasil.",
          );
        accept(result.data);
        if (action === "start") key.current = "";
      } catch (error) {
        if (action === "status") setOffline(true);
        setMessage(
          error instanceof Error && error.name !== "TimeoutError"
            ? error.message
            : "Koneksi terputus. Periksa status sebelum mencoba kembali.",
        );
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [accept],
  );
  useEffect(() => {
    if (enabled) void command("status");
  }, [command, enabled]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!enabled || sessionExpired.current) return;
      if (
        !token.current &&
        !document.hidden &&
        Date.now() >= renewAfter.current
      ) {
        renewAfter.current = Date.now() + 15000;
        await command("status");
      } else if (token.current && !document.hidden) {
        try {
          const response = await fetch("/api/local-updater/status", {
            headers: { Authorization: `Bearer ${token.current}` },
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(8000),
            ]),
          });
          if (response.status === 401) {
            token.current = "";
            renewAfter.current = 0;
            setOffline(true);
          } else if (!response.ok) setOffline(true);
          else accept(await response.json());
        } catch {
          if (!controller.signal.aborted) setOffline(true);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [accept, command, enabled]);
  const job = data?.jobs[0];
  const running = active(job);
  const progress =
    job?.state === "succeeded"
      ? 100
      : Math.max(0, stages.indexOf(job?.state ?? "")) * 12;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Update Versi</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Perbarui aplikasi dan pantau prosesnya di sini.
        </p>
      </header>
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-600">Versi terpasang</p>
            <p className="text-2xl font-bold tabular-nums">
              {data?.installedVersion || installedVersion || "Belum terdeteksi"}
            </p>
          </div>
          <span className="rounded-lg bg-zinc-100 px-3 py-2 text-sm">
            {data ? "Updater terhubung" : "Belum terhubung"}
          </span>
        </div>
        {!enabled ? (
          <p role="status">
            Update satu tombol belum dipasang pada toko ini. Operator perlu
            menyiapkan layanan terlebih dahulu.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Terakhir diperiksa:{" "}
              {data?.checkedAt ? date(data.checkedAt) : "Belum diperiksa"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-lg"
              disabled={busy || running}
              onClick={() => void command("check")}
            >
              {busy ? "Memeriksa…" : "Cek pembaruan"}
            </Button>
          </>
        )}
        {message && (
          <p role="alert" className="text-sm">
            {message}
          </p>
        )}
        {offline && (
          <p role="status" className="text-sm">
            Koneksi status terputus. Ini tidak membatalkan update. Status akan
            diperiksa kembali.
          </p>
        )}
        {data?.catalogError && data.catalogError !== "release_incompatible" && (
          <p role="status">
            Daftar rilis belum dapat diverifikasi. Coba lagi nanti.
          </p>
        )}
        {data?.availability?.state === "blocked" && !running && (
          <div role="status" className="space-y-2 rounded-lg bg-zinc-100 p-4">
            <p className="font-semibold">Versi {data.availability.latest?.version} tersedia, tetapi belum dapat dipasang</p>
            <p className="text-sm">{errors[data.availability.reason ?? ""] ?? "Hubungi operator untuk memeriksa kompatibilitas toko."}</p>
          </div>
        )}
        {data?.checkedAt && !data.catalogError && !data.release && !running && data.availability?.state === "current" && (
          <p role="status">Versi toko sudah terkini untuk kanal ini.</p>
        )}
        {data?.checkedAt && !data.catalogError && !data.release && !running && !data.availability && (
          <p role="status">Updater lama belum dapat membedakan versi terbaru dari rilis yang tidak kompatibel. Operator perlu memeriksa katalog dan meningkatkan updater.</p>
        )}
      </section>
      {data?.release && !running && (
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5 space-y-3">
          <h2 className="font-bold">Versi {data.release.version} tersedia</h2>
          <p className="whitespace-pre-wrap text-sm">{data.release.notes}</p>
          {data.availability?.latest && data.availability.latest.version !== data.release.version && (
            <p className="text-sm">Versi terbaru: {data.availability.latest.version}. Pasang {data.release.version} terlebih dahulu melalui jalur yang didukung, lalu periksa kembali.</p>
          )}
          <p className="text-sm text-zinc-600">
            Toko berhenti sementara saat pencadangan dan aktivasi. Data toko
            dipertahankan. Anda boleh menutup halaman setelah update dimulai.
          </p>
          <Button
            type="button"
            className="min-h-11 rounded-lg"
            disabled={busy}
            onClick={() => void command("start", data.release!.sha)}
          >
            Update sekarang
          </Button>
        </section>
      )}
      {job && (
        <section
          className="rounded-xl border border-line bg-white p-4 sm:p-5 space-y-3"
          aria-live="polite"
        >
          <h2 className="font-bold">
            {labels[job.state] ?? "Memeriksa status"} · v{job.version}
          </h2>
          {stages.includes(job.state) || job.state === "succeeded" ? (
            <>
              <progress
                className="h-2 w-full"
                max={100}
                value={progress}
                aria-label="Progres tahapan update"
              />
              <p className="text-sm text-zinc-600">
                {progress}% tahapan selesai · bukan perkiraan waktu
              </p>
              {job.state === "downloading" && !!job.detail.total && (
                <p className="text-sm tabular-nums">
                  Unduhan:{" "}
                  {Math.floor(
                    ((job.detail.downloaded ?? 0) / job.detail.total) * 100,
                  )}
                  %
                </p>
              )}
            </>
          ) : null}
          {job.detail.error && (
            <p className="text-sm">
              {errors[job.detail.error] ??
                "Pembaruan belum dapat diselesaikan. Operator dapat memeriksa catatan proses."}
            </p>
          )}
          {job.state === "succeeded" && (
            <>
              <p className="text-sm">
                Versi {job.detail.activeVersion} aktif ·{" "}
                {date(job.detail.finishedAt ?? job.updated)}
              </p>
              <Button
                type="button"
                className="min-h-11 rounded-lg"
                onClick={() => window.location.reload()}
              >
                Muat ulang dashboard
              </Button>
            </>
          )}
          {job.state === "recovery_required" && (
            <p className="text-sm">
              Update berikutnya dikunci sampai kondisi toko diperiksa. Data
              tidak dipulihkan otomatis dari cadangan lama.
            </p>
          )}
          <p className="break-all text-xs text-zinc-500">Referensi proses: {job.id}</p>
        </section>
      )}
      {!!data?.jobs.length && (
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="mb-3 font-bold">Riwayat update</h2>
          <ul className="divide-y divide-zinc-100">
            {data.jobs.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span>
                  v{item.version} · {labels[item.state]}
                </span>
                <time
                  dateTime={new Date(item.updated * 1000).toISOString()}
                  className="text-zinc-600"
                >
                  {date(item.updated)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
