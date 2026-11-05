/* eslint-disable @next/next/no-img-element -- Session-bound private media and blob previews must retain browser credentials. */
"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { reorderById, SortableHandle } from "./sortable-handle";
type Photo = { id: string; url: string; alt: string };
type Task = { id: string; file: File; preview: string; progress: number; error: string };
const fingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
export function ProductPhotoEditor({ photos, name, disabled, canUndo, onUndo, onChange, onRemove, onUpload, onBusy }: {
  photos: Photo[]; name: string; disabled: boolean; canUndo: boolean; onUndo: () => void;
  onChange: (photos: Photo[]) => void; onRemove: (id: string) => void;
  onUpload: (file: File, progress: (percent: number) => void) => Promise<Photo | undefined>; onBusy: (busy: boolean) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notice, setNotice] = useState("");
  const queue = useRef<Task[]>([]);
  const running = useRef(false);
  const known = useRef(new Map<string, string>());
  useEffect(() => () => queue.current.forEach(task => URL.revokeObjectURL(task.preview)), []);
  const update = (next: Task[]) => { queue.current = next; setTasks(next); };
  async function run(batch: Task[]) {
    if (running.current) return;
    running.current = true; onBusy(true);
    try {
      for (const task of batch) {
        update(queue.current.map(t => t.id === task.id ? { ...t, error: "", progress: 0 } : t));
        try {
          const image = await onUpload(task.file, progress => update(queue.current.map(t => t.id === task.id ? { ...t, progress } : t)));
          if (!image) throw new Error("Upload gagal. Coba lagi.");
          known.current.set(fingerprint(task.file), image.id);
          URL.revokeObjectURL(task.preview);
          update(queue.current.filter(t => t.id !== task.id));
        } catch (error) {
          update(queue.current.map(t => t.id === task.id ? { ...t, error: error instanceof Error ? error.message : "Upload gagal." } : t));
        }
      }
    } finally { running.current = false; onBusy(false); }
  }
  return <section id="product-images" className="seller-photo-section">
    <div className="flex items-start gap-3"><ImagePlus size={22} aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="text-base font-bold">Foto produk</h2><p className="mt-1 text-xs text-zinc-600">Foto pertama menjadi foto utama. Geser melalui handle untuk mengurutkan.</p></div><span className="text-xs">{photos.length}/10</span></div>
    <div className="seller-gallery-grid">
      {photos.map((photo, index) => <div key={photo.id} data-sort-scope="product-gallery" data-sort-id={photo.id} className="seller-gallery-photo">
        <img src={photo.url} alt={photo.alt || `${name || "Produk"} — foto ${index + 1}`} draggable={false} />
        {index === 0 && <span className="seller-cover-badge">Utama</span>}
        <div className="seller-photo-controls"><SortableHandle id={photo.id} scope="product-gallery" label={`foto ${index + 1}`} disabled={disabled || running.current} onMove={(from, to) => onChange(reorderById(photos, from, to))} />
          <button type="button" aria-label={`Hapus gambar ${index + 1}`} disabled={disabled || running.current} onClick={() => onRemove(photo.id)}><Trash2 size={17} /></button></div>
      </div>)}
      {tasks.map(task => <div key={task.id} className="seller-gallery-task"><img src={task.preview} alt="Pratinjau foto sedang diunggah" /><div>
        {task.error ? <><p role="alert">{task.error}</p><button type="button" disabled={disabled || running.current} onClick={() => void run([task])}>Coba lagi {task.file.name}</button><button type="button" aria-label={`Batalkan ${task.file.name}`} disabled={disabled || running.current} onClick={() => { URL.revokeObjectURL(task.preview); update(queue.current.filter(t => t.id !== task.id)); }}>Batalkan</button></> : <><span role="status">Mengunggah {task.progress}%</span><progress max={100} value={task.progress} aria-label={`Progress ${task.file.name}`} /></>}
      </div></div>)}
      {photos.length + tasks.length < 10 && <label htmlFor="product-image-upload" className="seller-photo-add"><Plus size={22} /><span>Tambah foto</span></label>}
    </div>
    <label htmlFor="product-image-upload" className="sr-only">Unggah JPG, PNG, atau WebP</label>
    <input id="product-image-upload" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled || running.current || photos.length + tasks.length >= 10} aria-describedby="product-image-help" onChange={event => {
      const files = Array.from(event.target.files || []); event.target.value = "";
      const available = 10 - photos.length - queue.current.length;
      const selected: File[] = [], seen = new Set(queue.current.map(t => fingerprint(t.file)));
      let skipped = 0;
      for (const file of files) {
        const key = fingerprint(file), existing = known.current.get(key);
        if (seen.has(key) || (existing && photos.some(p => p.id === existing))) { skipped++; continue; }
        seen.add(key); selected.push(file);
      }
      setNotice(selected.length > available ? `Maksimal 10 foto. ${selected.length - available} file tidak ditambahkan.` : skipped ? `${skipped} file duplikat dilewati.` : "");
      const batch = selected.slice(0, available).map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), progress: 0, error: !["image/jpeg", "image/png", "image/webp"].includes(file.type) ? "Gunakan JPG, PNG, atau WebP." : !file.size || file.size > 4 * 1024 * 1024 ? "Ukuran gambar harus 1 byte–4 MB." : "" }));
      update([...queue.current, ...batch]); void run(batch.filter(t => !t.error));
    }} />
    <p id="product-image-help" className="text-xs text-zinc-600">Pilih beberapa foto sekaligus. JPG, PNG, WebP; maksimal 4 MB per foto, 10 foto per produk.</p>
    {notice && <p role="status" className="text-xs">{notice}</p>}
    {canUndo && <button type="button" className="min-h-11 text-sm underline" disabled={disabled || running.current} onClick={onUndo}>Pulihkan foto yang dihapus</button>}
  </section>;
}
