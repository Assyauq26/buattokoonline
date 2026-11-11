"use client";

import { useEffect, useState, useRef } from "react";
import { SettingsFeedback } from "./settings-feedback";
import { shippingRequest } from "./shipping-settings";

const url = "/api/v1/admin/integrations/jnt/mapping";
type Report = {
  total: number;
  valid: number;
  invalid: number;
  unmatched: number;
  ambiguous: number;
  duplicate: number;
  issues: { row: number; reason: string }[];
};
type Version = {
  version: string;
  filename: string;
  uploadedAt: string;
  checksum: string;
  source: string;
  report: Report;
};
export type MappingStatus = {
  activeVersion: string | null;
  versions: Version[];
};

export function readMapping() {
  return shippingRequest<MappingStatus>(url);
}

export function JntMappingSettings({
  state,
  onChange,
}: {
  state: MappingStatus | null;
  onChange: () => Promise<void>;
}) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const active = state?.versions.find(
    (item) => item.version === state.activeVersion,
  );
  async function upload(file?: File) {
    if (!file || busy || lock.current) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Ukuran file maksimal 2 MB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setProgress(0);
    setNotice("");
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.timeout = 120000;
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.setRequestHeader(
          "x-jnt-mapping-options",
          encodeURIComponent(
            JSON.stringify({ filename: file.name, automatic: true }),
          ),
        );
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 90));
        };
        xhr.onload = () => {
          try {
            const result = JSON.parse(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300 || !result.success)
              throw new Error(result.error?.message || "Upload gagal.");
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        xhr.onerror = () =>
          reject(new Error("Koneksi terputus. Coba unggah kembali."));
        xhr.ontimeout = () =>
          reject(
            new Error(
              "Waktu upload habis. Muat ulang untuk memeriksa status mapping.",
            ),
          );
        xhr.send(file);
      });
      await onChange();
      setProgress(100);
      setNotice(
        "Mapping berhasil diunggah, seluruh baris sesuai, dan otomatis aktif.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Mapping wilayah resmi J&T</h2>
        <span
          className={
            active
              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
              : "rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800"
          }
        >
          {active
            ? "Mapping aktif · " + active.report.valid + " wilayah"
            : "Belum diunggah"}
        </span>
      </div>
      <label className="block rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm">
        <span className="block font-medium">Unggah file template mapping</span>
        <span className="mb-3 mt-1 block text-zinc-500">
          CSV atau XLSX, maksimal 2 MB. Kolom dikenali dan mapping diaktifkan
          otomatis setelah validasi.
        </span>
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={busy}
          className="block max-w-full text-sm"
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <a
        href="/templates/jnt-mapping.csv"
        download
        className="text-sm underline"
      >
        Unduh template kolom mapping
      </a>
      {active && <p className="text-sm text-zinc-600">{active.filename}</p>}
      {(busy || progress === 100) && (
        <div>
          <div className="mb-2 flex justify-between text-xs">
            <span>
              {progress === 100
                ? "Selesai"
                : progress >= 90
                  ? "Memvalidasi dan mengaktifkan mapping…"
                  : "Mengunggah file…"}
            </span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progres upload mapping"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 overflow-hidden rounded-full bg-zinc-100"
          >
            <div
              style={{ width: progress + "%" }}
              className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            />
          </div>
        </div>
      )}
      <SettingsFeedback message={notice} />
    </section>
  );
}

type District = {
  province: string;
  city: string;
  district: string;
  emsifaDistrictCode: string;
  sendSiteCode: string;
  originCityCode: string;
};
export function JntDistrictPicker({
  label,
  value,
  onChange,
  version,
  showOrigin,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  version?: string | null;
  showOrigin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [districts, setDistricts] = useState<District[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const text = query.trim() || value;
    if (!version || text.length < 2) {
      setDistricts([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      shippingRequest<{ districts: District[] }>(
        url + "?q=" + encodeURIComponent(text),
        { signal: controller.signal },
      )
        .then((result) => {
          setDistricts(result.districts);
          setNotice(
            result.districts.length
              ? ""
              : "Kecamatan tidak ditemukan dalam mapping aktif.",
          );
        })
        .catch((error) => {
          if (!controller.signal.aborted) setNotice((error as Error).message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, version, value]);
  const selected = districts.find((row) => row.emsifaDistrictCode === value);
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        {label}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!version}
          placeholder="Cari provinsi, kota, atau kecamatan"
          className="mt-1 block w-full rounded bg-zinc-100 p-2"
        />
      </label>
      <select
        aria-label={"Hasil pencarian " + label}
        value={
          districts.some((row) => row.emsifaDistrictCode === value) ? value : ""
        }
        disabled={!version}
        className="block w-full rounded bg-zinc-100 p-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Pilih kecamatan dari hasil pencarian</option>
        {districts.map((row) => (
          <option key={row.emsifaDistrictCode} value={row.emsifaDistrictCode}>
            {row.province} › {row.city} › {row.district}
          </option>
        ))}
      </select>
      {showOrigin && selected && (
        <p className="text-xs">
          Asal tarif {selected.sendSiteCode} · Asal Order{" "}
          {selected.originCityCode}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
    </div>
  );
}
