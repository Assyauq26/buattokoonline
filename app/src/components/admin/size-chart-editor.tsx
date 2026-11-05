/* eslint-disable @next/next/no-img-element -- Session-bound private media and blob previews must retain browser credentials. */
"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultSizeChart, type SizeChart } from "@/modules/catalog/product-size-chart";
import { reorderById, SortableHandle } from "./sortable-handle";
type Photo = { id: string; url: string; alt: string };
export function SizeChartEditor({ value, photos, disabled, onChange, onUpload }: {
  value: SizeChart | null; photos: Photo[]; disabled: boolean;
  onChange: (value: SizeChart | null) => void; onUpload: (file: File, progress: (percent: number) => void) => Promise<Photo | undefined>;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"image" | "table">(value?.mode || "image");
  const chart = value?.mode === "table" ? value : null;
  const image = value?.mode === "image" ? photos.find(p => p.id === value.imageId) : undefined;
  const blocked = disabled || progress !== null;
  const patch = (table: NonNullable<typeof chart>["table"]) => onChange({ mode: "table", table });
  return <fieldset disabled={blocked} className="size-chart-editor">
    <legend className="text-sm font-semibold">Tabel ukuran</legend>
    <p className="text-xs text-zinc-600">Opsional. Panduan ukuran akan tampil pada halaman produk customer.</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Mode tabel ukuran">
      <Button type="button" variant={mode === "image" ? "default" : "outline"} aria-pressed={mode === "image"} onClick={() => {
        if (mode === "image") return;
        if (value?.mode === "table" && !window.confirm("Ganti ke gambar? Tabel custom dalam formulir akan dihapus.")) return;
        setMode("image"); onChange(null);
      }}>Upload gambar</Button>
      <Button type="button" variant={mode === "table" ? "default" : "outline"} aria-pressed={mode === "table"} onClick={() => {
        if (value?.mode === "image" && !window.confirm("Ganti ke tabel custom? Gambar tetap tersedia di pustaka foto.")) return;
        setMode("table"); if (!chart) onChange(defaultSizeChart());
      }}>Buat tabel custom</Button>
      {value && <Button type="button" variant="ghost" onClick={() => onChange(null)}><Trash2 size={16} />Hapus tabel ukuran</Button>}
    </div>
    {mode === "image" && <div className="space-y-2">
      {image && <img src={image.url} alt="Pratinjau tabel ukuran" className="max-h-64 max-w-full rounded-lg object-contain" />}
      <label className="block text-sm font-medium" htmlFor="size-chart-upload">{image ? "Ganti gambar tabel ukuran" : "Gambar tabel ukuran"}</label>
      <input id="size-chart-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        setProgress(0); setError("");
        try { const uploaded = await onUpload(file, setProgress); if (uploaded) onChange({ mode: "image", imageId: uploaded.id }); else setError("Gagal mengunggah tabel ukuran. Pilih file kembali untuk mencoba lagi."); }
        catch { setError("Gagal mengunggah tabel ukuran. Coba lagi."); }
        finally { setProgress(null); }
      }} />
      <p className="text-xs text-zinc-600">JPG, PNG, WebP; maksimal 4 MB. Gambar tidak menjadi bagian galeri.</p>
    </div>}
    {mode === "table" && !chart && <Button type="button" variant="outline" onClick={() => onChange(defaultSizeChart())}>Mulai tabel ukuran</Button>}
    {chart && <>
      <label className="flex items-center gap-2 text-sm">Satuan
        <select aria-label="Satuan tabel ukuran" value={chart.table.unit || ""} onChange={e => patch({ ...chart.table, unit: (e.target.value || null) as "cm" | "inch" | null })}>
          <option value="">Tanpa satuan</option><option value="cm">cm</option><option value="inch">inci</option>
        </select>
      </label>
      <div className="size-chart-scroll" role="region" aria-label="Editor tabel ukuran" tabIndex={0}>
        <table><thead><tr>{chart.table.columns.map((column, i) => <th key={column.id} data-sort-id={column.id} data-sort-scope="size-chart-columns">
          <div className="flex items-center gap-1">
            <SortableHandle id={column.id} scope="size-chart-columns" label={`kolom ${i + 1}`} onMove={(from, to) => patch({ ...chart.table, columns: reorderById(chart.table.columns, from, to) })} />
            <input aria-label={`Judul kolom ${i + 1}`} value={column.label} maxLength={60} onChange={e => patch({ ...chart.table, columns: chart.table.columns.map(c => c.id === column.id ? { ...c, label: e.target.value } : c) })} />
            <button type="button" aria-label={`Hapus kolom ${i + 1}`} disabled={chart.table.columns.length === 1} onClick={() => patch({ ...chart.table, columns: chart.table.columns.filter(c => c.id !== column.id), rows: chart.table.rows.map(row => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([key]) => key !== column.id)) })) })}><Trash2 size={16} /></button>
          </div>
        </th>)}<th><span className="sr-only">Aksi baris</span></th></tr></thead><tbody>
          {chart.table.rows.map((row, ri) => <tr key={row.id}>{chart.table.columns.map((column, ci) => <td key={column.id}>
            <input aria-label={`Ukuran baris ${ri + 1} kolom ${ci + 1}`} value={row.cells[column.id] || ""} maxLength={80} onChange={e => patch({ ...chart.table, rows: chart.table.rows.map(r => r.id === row.id ? { ...r, cells: { ...r.cells, [column.id]: e.target.value } } : r) })} />
          </td>)}<td><button type="button" aria-label={`Hapus baris ${ri + 1}`} disabled={chart.table.rows.length === 1} onClick={() => patch({ ...chart.table, rows: chart.table.rows.filter(r => r.id !== row.id) })}><Trash2 size={16} /></button></td></tr>)}
        </tbody></table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={chart.table.columns.length >= 10} onClick={() => { const id = crypto.randomUUID(); patch({ ...chart.table, columns: [...chart.table.columns, { id, label: "Parameter" }], rows: chart.table.rows.map(r => ({ ...r, cells: { ...r.cells, [id]: "" } })) }); }}><Plus size={16} />Tambah kolom</Button>
        <Button type="button" variant="outline" disabled={chart.table.rows.length >= 50} onClick={() => patch({ ...chart.table, rows: [...chart.table.rows, { id: crypto.randomUUID(), cells: Object.fromEntries(chart.table.columns.map(c => [c.id, ""])) }] })}><Plus size={16} />Tambah baris</Button>
      </div>
      <p className="text-xs text-zinc-600">Maksimal 10 kolom dan 50 baris. Isi setiap sel sebelum menyimpan; teks dan angka diperbolehkan.</p>
    </>}
    {progress !== null && <p role="status">Mengunggah tabel ukuran {progress}%</p>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
