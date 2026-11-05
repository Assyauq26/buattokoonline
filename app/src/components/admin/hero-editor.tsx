
"use client";
import { useMemo, useState } from "react";
import Link from "@/components/ui/navigation";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { heroSchema, type HeroConfig, type HeroSlideConfig } from "@/modules/hero/schema";
import { heroAction, loadHero } from "@/modules/hero/actions";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";

type Snapshot = { config: HeroConfig; draftVersion: number; publishedVersion: number };
const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-800";
const labelClass = "block text-sm font-medium text-zinc-800";
const newSlide = (): HeroSlideConfig => ({
  id: crypto.randomUUID(), desktopAssetId: null, mobileAssetId: null,
  alt: "Koleksi fashion terbaru", heading: "", description: "",
  ctaLabel: "", ctaHref: "", align: "left", tone: "light", overlay: 0,
});
const privateImage = (id: string | null) =>
  id ? `/api/v1/admin/store-hero/${id}` : null;

export function HeroEditor({ initial, canUpdate, canPublish }: {
  initial: Snapshot; canUpdate: boolean; canPublish: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<HeroConfig>(initial.config);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.config);
  const parsed = useMemo(() => heroSchema.safeParse(draft), [draft]);
  const slideSet = (id: string, field: keyof HeroSlideConfig, value: string | number | null) => {
    setDraft(prev => ({ ...prev, slides: prev.slides.map(s =>
      s.id === id ? { ...s, [field]: value } : s,
    ) }));
    setMessage("");
  };
  const move = (id: string, distance: number) => setDraft(prev => {
    const slides = [...prev.slides];
    const from = slides.findIndex(s => s.id === id), to = from + distance;
    if (from < 0 || to < 0 || to >= slides.length) return prev;
    [slides[from], slides[to]] = [slides[to], slides[from]];
    return { ...prev, slides };
  });
  async function upload(id: string, field: "desktopAssetId" | "mobileAssetId", file: File) {
    if (!canUpdate) return;
    if (file.size > 2 * 1024 * 1024) { setError("Gambar maksimal 2 MiB"); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      form.set("image", file);
      form.set("requestId", crypto.randomUUID());
      const res = await fetch("/api/v1/admin/store-hero", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Upload gagal");
      slideSet(id, field, String(json.data.id));
      setMessage("Gambar diunggah privat. Simpan Draft untuk menyimpannya.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload gagal");
    } finally { setBusy(false); }
  }
  async function perform(kind: "save" | "publish" | "discard") {
    if (kind === "publish" && (dirty || !canPublish)) return;
    if ((kind === "save" || kind === "discard") && !canUpdate) return;
    if (kind === "publish" && !window.confirm("Terbitkan banner Hero ke seluruh pengunjung toko?")) return;
    if (kind === "discard" && !window.confirm("Buang draft dan kembalikan ke banner yang terakhir diterbitkan?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await heroAction({
        kind, draftVersion: saved.draftVersion,
        publishedVersion: saved.publishedVersion,
        ...(kind === "save" ? { config: draft } : {}),
      });
      if (!res.ok || !res.data) throw new Error(res.error ?? "Perubahan gagal");
      setSaved(res.data); setDraft(res.data.config);
      setMessage(kind === "publish" ? "Banner Hero berhasil diterbitkan." :
        kind === "discard" ? "Draft dikembalikan ke konten published." :
        "Draft Hero tersimpan. Toko publik belum berubah.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Perubahan gagal");
    } finally { setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm("Buang perubahan lokal dan muat ulang draft terbaru?")) return;
    setBusy(true); setError("");
    const res = await loadHero();
    if (res.ok && res.data) { setDraft(res.data.config); setSaved(res.data); setMessage("Draft terbaru dimuat."); }
    else setError(res.error ?? "Gagal memuat ulang");
    setBusy(false);
  }
  const previewSlides = draft.slides.flatMap(s => {
    const image = privateImage(s.desktopAssetId);
    if (!image) return [];
    return [{
      image, mobileImage: privateImage(s.mobileAssetId) || undefined,
      alt: s.alt, heading: s.heading, description: s.description,
      ctaLabel: s.ctaLabel, ctaHref: s.ctaHref, align: s.align,
      tone: s.tone, overlay: s.overlay,
    }];
  });
  return (
    <div className="min-w-0 space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/customize" className="text-xs font-semibold text-zinc-500 hover:text-black">‹ Kembali ke Customize</Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Banner Hero</h1>
          <p className="mt-1 text-sm text-zinc-500">Kelola konten carousel beranda. Draft v{saved.draftVersion} · Published v{saved.publishedVersion}</p>
          <p className="mt-1 text-xs text-zinc-500">Pengunjung tetap melihat banner sebelumnya sampai tombol Terbitkan ditekan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reload} disabled={busy} className="min-h-11 rounded-full bg-zinc-100 px-4 text-sm font-semibold disabled:opacity-40">Muat ulang</button>
          <button type="button" onClick={() => perform("save")}
            disabled={!canUpdate || !dirty || busy || !parsed.success}
            className="min-h-11 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white disabled:bg-zinc-300">Simpan Draft</button>
          <button type="button" onClick={() => perform("publish")}
            disabled={!canPublish || dirty || busy || !parsed.success || (draft.enabled && (!draft.slides.length || draft.slides.some(s => !s.desktopAssetId)))}
            className="min-h-11 rounded-full bg-black px-5 text-sm font-semibold text-white disabled:bg-zinc-300">Terbitkan</button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-zinc-700">{message}</p>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!parsed.success && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{parsed.error.issues[0]?.message}</p>}
      <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
          Tampilkan banner Hero
          <input type="checkbox" className="size-5 accent-black" checked={draft.enabled} disabled={!canUpdate || busy}
            onChange={e => setDraft(v => ({ ...v, enabled: e.target.checked }))}/>
        </label>
        <label className={labelClass}>Rotasi otomatis (detik)
          <select value={draft.autoplaySeconds} disabled={!canUpdate || busy}
            onChange={e => setDraft(v => ({ ...v, autoplaySeconds: Number(e.target.value) }))} className={inputClass}>
            {[3,4,5,6,7,8,10,12,15].map(v => <option key={v} value={v}>{v} detik</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-base font-bold">Preview Hero</h2>
        {draft.enabled && previewSlides.length
          ? <div className="mx-auto max-w-3xl space-y-3">
              <HeroCarousel slides={previewSlides} autoplaySeconds={draft.autoplaySeconds} preview />
              <p className="text-xs text-zinc-500">Preview responsif: gunakan lebar browser untuk memeriksa gambar mobile/desktop.</p>
            </div>
          : <p className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">Banner tidak aktif atau gambar desktop belum tersedia.</p>}
      </div>
      <div className="flex items-center justify-between">
        <div><h2 className="font-bold">Daftar Slide ({draft.slides.length}/6)</h2>
          <p className="text-xs text-zinc-500">Slide pertama tampil terlebih dahulu. Gunakan tombol panah untuk mengatur urutan.</p></div>
        <button type="button" onClick={() => setDraft(v => ({ ...v, slides: [...v.slides, newSlide()] }))}
          disabled={!canUpdate || busy || draft.slides.length >= 6}
          className="flex min-h-11 items-center gap-1 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:bg-zinc-300">
          <Plus size={17}/> Tambah
        </button>
      </div>
      {draft.slides.map((s, index) => (
        <section key={s.id} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">Slide {index + 1}</h3>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Naikkan slide ${index + 1}`} disabled={busy || !canUpdate || index === 0}
                onClick={() => move(s.id, -1)} className="grid size-10 place-items-center rounded-full hover:bg-zinc-100 disabled:opacity-30"><ArrowUp size={17}/></button>
              <button type="button" aria-label={`Turunkan slide ${index + 1}`} disabled={busy || !canUpdate || index === draft.slides.length - 1}
                onClick={() => move(s.id, 1)} className="grid size-10 place-items-center rounded-full hover:bg-zinc-100 disabled:opacity-30"><ArrowDown size={17}/></button>
              <button type="button" aria-label={`Hapus slide ${index + 1}`} disabled={busy || !canUpdate}
                onClick={() => { if (window.confirm("Hapus slide ini dari draft?")) setDraft(v => ({ ...v, slides: v.slides.filter(x => x.id !== s.id) })); }}
                className="grid size-10 place-items-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 size={17}/></button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["desktopAssetId", "Gambar desktop (wajib)", "Direkomendasikan 1600 × 800"],
              ["mobileAssetId", "Gambar mobile (opsional)", "Direkomendasikan 900 × 700"],
            ] as const).map(([field,title,help]) => (
              <label key={field} className={labelClass}>
                {title} <span className="block text-xs font-normal text-zinc-500">{help} · PNG/JPEG/WebP maks. 2 MiB</span>
                <span className="mt-2 flex aspect-[16/8] items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
                  {s[field] ? <img src={privateImage(s[field])!} alt={s.alt} className="h-full w-full object-cover"/> : <ImagePlus size={24} className="text-zinc-400"/>}
                </span>
                <input aria-label={title + " slide " + (index + 1)} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !canUpdate}
                  className="mt-2 block w-full text-xs" onChange={e => { const file=e.currentTarget.files?.[0]; if(file) void upload(s.id,field,file); e.currentTarget.value=""; }}/>
                {s[field] && <button type="button" disabled={busy || !canUpdate} onClick={() => slideSet(s.id,field,null)}
                  className="mt-2 text-xs font-semibold text-zinc-600 underline">Lepaskan gambar</button>}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["alt","Teks alternatif gambar"],
              ["heading","Judul banner"],
              ["description","Deskripsi singkat"],
              ["ctaLabel","Label tombol CTA"],
              ["ctaHref","Tautan tombol (path internal)"],
            ] as const).map(([field,title]) => (
              <label key={field} className={labelClass}>{title}
                <input value={s[field]} disabled={busy || !canUpdate} maxLength={field === "description" ? 220 : field === "alt" ? 160 : field === "ctaHref" ? 240 : 100}
                  placeholder={field === "ctaHref" ? "/shop" : undefined}
                  onChange={e => slideSet(s.id,field,e.target.value)}
                  className={inputClass}/>
              </label>
            ))}
            <label className={labelClass}>Posisi konten
              <select className={inputClass} value={s.align} disabled={busy || !canUpdate}
                onChange={e => slideSet(s.id,"align",e.target.value)}>
                <option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option>
              </select>
            </label>
            <label className={labelClass}>Warna teks
              <select className={inputClass} value={s.tone} disabled={busy || !canUpdate}
                onChange={e => slideSet(s.id,"tone",e.target.value)}>
                <option value="light">Putih</option><option value="dark">Hitam</option>
              </select>
            </label>
            <label className={labelClass}>Overlay gelap ({s.overlay}%)
              <input type="range" className="mt-3 w-full accent-black" min={0} max={60}
                value={s.overlay} disabled={busy || !canUpdate}
                onChange={e => slideSet(s.id,"overlay",Number(e.target.value))}/>
            </label>
          </div>
        </section>
      ))}
      {saved.publishedVersion > 0 && <div className="flex items-center justify-between rounded-xl bg-zinc-100 p-4">
        <p className="text-sm text-zinc-600">Ingin kembali ke banner yang sudah live?</p>
        <button type="button" onClick={() => perform("discard")} disabled={busy || !canUpdate} className="text-sm font-bold underline disabled:opacity-40">Buang Draft</button>
      </div>}
    </div>
  );
}
