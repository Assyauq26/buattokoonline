"use client";

import { useEffect, useState } from "react";
import { shippingJson, shippingRequest } from "./shipping-settings";

const url = "/api/v1/admin/integrations/jnt/mapping";
const fields = [
  ["province", "Provinsi"], ["city", "Kabupaten/kota"], ["district", "Kecamatan"], ["districtCode", "Kode kecamatan internal (opsional)"],
  ["sendSiteCode", "sendSiteCode · asal tarif"], ["originCityCode", "origin_code · asal Order"],
  ["destAreaCode", "destAreaCode · tujuan tarif"], ["destinationCityCode", "destination_code · tujuan Order"],
  ["receiverArea", "receiver_area · kecamatan Order"],
] as const;
type Report = { total: number; valid: number; invalid: number; unmatched: number; ambiguous: number; duplicate: number; issues: { row: number; reason: string }[] };
type Preview = { header: string[]; samples: string[][]; checksum: string; version: string; sheet?: string; sheets: string[]; report: Report };
type Version = { version: string; filename: string; uploadedAt: string; checksum: string; source: string; report: Report };
export type MappingStatus = { activeVersion: string | null; versions: Version[] };

export function readMapping() { return shippingRequest<MappingStatus>(url); }

export function JntMappingSettings({ state, onChange }: { state: MappingStatus | null; onChange: () => Promise<void> }) {
  const [file, setFile] = useState<File>();
  const [sheet, setSheet] = useState("");
  const [delimiter, setDelimiter] = useState<"," | ";">(",");
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Preview>();
  const [validated, setValidated] = useState<Preview>();
  const [source, setSource] = useState("");
  const [official, setOfficial] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function resetPreview() {
    setPreview(undefined); setValidated(undefined); setColumns({});
  }

  async function upload(action: "preview" | "validate" | "stage") {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice("Batas file 2 MiB."); return; }
    setBusy(true); setNotice("");
    try {
      const options = { filename: file.name, sheet: sheet || undefined, delimiter, headerRow,
        columns: action === "preview" ? undefined : columns,
        stage: action === "stage" ? { reviewedVersion: validated?.version, source, official } : undefined };
      const data = await shippingRequest<Preview>(url, { method: "POST", body: file,
        headers: { "Content-Type": "application/octet-stream", "x-jnt-mapping-options": encodeURIComponent(JSON.stringify(options)) } });
      if (action === "preview") { setPreview(data); setValidated(undefined); }
      if (action === "validate") setValidated(data);
      if (action === "stage") { await onChange(); setNotice("Versi tersimpan dan menunggu aktivasi."); }
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function activate() {
    setBusy(true); setNotice("");
    try {
      await shippingRequest(url, shippingJson("PUT", { version: candidate, confirm: true }));
      await onChange(); setCandidate(""); setNotice("Versi mapping dipilih sebagai mapping aktif. Uji tarif perlu dijalankan kembali.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <fieldset disabled={busy} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <h2 className="font-semibold">Mapping Wilayah Resmi J&T</h2>
    <p className="text-sm text-zinc-600">Gunakan file yang diberikan atau dikonfirmasi oleh J&T. CSV UTF-8 dan XLSX, maks. 2 MiB, 12.000 baris data dan 40 kolom.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="block min-w-0 text-sm">File mapping<input type="file" accept=".csv,.xlsx" className="block max-w-full" onChange={event => {
        setFile(event.target.files?.[0]); setSheet(""); setOfficial(false); setSource(""); resetPreview();
      }} /></label>
      <label className="text-sm">Baris header<input type="number" min={1} max={12000} value={headerRow} className="block w-24 rounded bg-zinc-100 p-2" onChange={event => {
        setHeaderRow(Number(event.target.value)); resetPreview();
      }} /></label>
      {file?.name.toLowerCase().endsWith(".xlsx") && !preview && <label className="text-sm">Nama sheet (opsional)
        <input value={sheet} maxLength={80} placeholder="Sheet pertama" className="block w-40 rounded bg-zinc-100 p-2"
          onChange={event => { setSheet(event.target.value); resetPreview(); }} />
      </label>}
      {file?.name.toLowerCase().endsWith(".csv") && <label className="text-sm">Pemisah CSV<select className="block rounded bg-zinc-100 p-2" value={delimiter} onChange={event => {
        setDelimiter(event.target.value as "," | ";"); resetPreview();
      }}><option value=",">Koma</option><option value=";">Titik koma</option></select></label>}
      <button type="button" className="min-h-11 rounded-xl bg-zinc-100 px-4 text-sm" disabled={!file} onClick={() => upload("preview")}>Pratinjau file</button>
    </div>
    {preview && <>
      {preview.sheets.length > 1 && <label className="block text-sm">Sheet
        <select value={sheet || preview.sheet} className="ml-2 rounded bg-zinc-100 p-2" onChange={event => { setSheet(event.target.value); resetPreview(); }}>
          {preview.sheets.map(name => <option key={name}>{name}</option>)}
        </select>
      </label>}
      <div className="overflow-x-auto"><table className="text-left text-xs">
        <thead><tr>{preview.header.map((header, index) => <th key={index} className="p-2">{header || "—"}</th>)}</tr></thead>
        <tbody>{preview.samples.map((row, index) => <tr key={index}>{preview.header.map((_, cell) => <td key={cell} className="p-2">{row[cell]}</td>)}</tr>)}</tbody>
      </table></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => <label key={key} className="text-sm">{label}
          <select className="mt-1 block w-full rounded bg-zinc-100 p-2" value={columns[key] ?? ""} onChange={event => {
            const value = event.target.value;
            const next = { ...columns };
            if (value === "") delete next[key]; else next[key] = Number(value);
            setColumns(next); setValidated(undefined);
          }}>
            <option value="">Pilih kolom</option>
            {preview.header.map((header, index) => header && <option key={index} value={index}>{index + 1}. {header}</option>)}
          </select>
        </label>)}
      </div>
      <button type="button" className="min-h-11 rounded-xl bg-zinc-100 px-4 text-sm" onClick={() => upload("validate")}
        disabled={fields.some(([key]) => key !== "districtCode" && columns[key] === undefined)}>Validasi pemetaan</button>
    </>}
    {validated && <>
      <p className="text-sm">Total {validated.report.total} · Valid {validated.report.valid} · Tidak valid {validated.report.invalid} · Tidak cocok {validated.report.unmatched} · Ambigu {validated.report.ambiguous} · Duplikat {validated.report.duplicate}</p>
      <p className="break-all text-xs">Checksum SHA-256 {validated.checksum}</p>
      <ul className="max-h-48 overflow-y-auto text-sm">{validated.report.issues.map(issue => <li key={issue.row}>Baris {issue.row} · {issue.reason}</li>)}</ul>
      <label className="block text-sm">Referensi konfirmasi dari J&T<input value={source} maxLength={240} onChange={event => setSource(event.target.value)} className="block w-full rounded bg-zinc-100 p-2" /></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={official} onChange={event => setOfficial(event.target.checked)} />Saya mengonfirmasi bahwa file ini berasal dari atau telah disetujui J&T untuk toko ini.</label>
      <button type="button" className="min-h-11 rounded-xl bg-zinc-100 px-4 text-sm" onClick={() => upload("stage")}
        disabled={!official || source.trim().length < 8 || !validated.report.valid || validated.report.valid !== validated.report.total}>Simpan versi untuk ditinjau</button>
    </>}
    <div className="space-y-2 border-t border-zinc-200 pt-4">
      <h3 className="text-sm font-semibold">Aktivasi dan rollback mapping</h3>
      <p className="text-xs text-zinc-600">Versi dapat diganti saat checkout menggunakan Manual. Pilih versi lama untuk rollback dan uji tarif ulang.</p>
      <p className="break-all text-xs">Versi aktif {state?.activeVersion || "belum ada"}</p>
      <label className="block text-sm">Versi yang akan digunakan
        <select value={candidate} onChange={event => setCandidate(event.target.value)} className="block w-full rounded bg-zinc-100 p-2">
          <option value="">Pilih versi</option>
          {state?.versions.map(version => <option key={version.version} value={version.version}>{version.filename} · {version.version.slice(0, 12)} · {version.report.valid} baris</option>)}
        </select>
      </label>
      <button type="button" className="min-h-11 rounded-xl bg-zinc-100 px-4 text-sm" disabled={!candidate || candidate === state?.activeVersion} onClick={activate}>Konfirmasi aktivasi versi</button>
    </div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </fieldset>;
}

type District = { province: string; city: string; district: string; emsifaDistrictCode: string; sendSiteCode: string; originCityCode: string };
export function JntDistrictPicker({ label, value, onChange, version, showOrigin }: {
  label: string; value: string; onChange: (code: string) => void; version?: string | null; showOrigin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [districts, setDistricts] = useState<District[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const text = query.trim() || value;
    if (!version || text.length < 2) { setDistricts([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      shippingRequest<{ districts: District[] }>(url + "?q=" + encodeURIComponent(text), { signal: controller.signal })
        .then(result => {
          setDistricts(result.districts);
          setNotice(result.districts.length ? "" : "Kecamatan tidak ditemukan dalam mapping aktif.");
        }).catch(error => { if (!controller.signal.aborted) setNotice((error as Error).message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, version, value]);
  const selected = districts.find(row => row.emsifaDistrictCode === value);
  return <div className="space-y-2">
    <label className="block text-sm">{label}<input value={query} onChange={event => setQuery(event.target.value)}
      disabled={!version} placeholder="Cari provinsi, kota, atau kecamatan" className="mt-1 block w-full rounded bg-zinc-100 p-2" /></label>
    <select aria-label={"Hasil pencarian " + label} value={districts.some(row => row.emsifaDistrictCode === value) ? value : ""}
      disabled={!version} className="block w-full rounded bg-zinc-100 p-2 text-sm" onChange={event => onChange(event.target.value)}>
      <option value="">Pilih kecamatan dari hasil pencarian</option>
      {districts.map(row => <option key={row.emsifaDistrictCode} value={row.emsifaDistrictCode}>{row.province} › {row.city} › {row.district}</option>)}
    </select>
    {showOrigin && selected && <p className="text-xs">Asal tarif {selected.sendSiteCode} · Asal Order {selected.originCityCode}</p>}
    {notice && <p role="status" className="text-xs">{notice}</p>}
  </div>;
}
