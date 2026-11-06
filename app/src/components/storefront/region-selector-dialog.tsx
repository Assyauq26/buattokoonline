"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, MapPin, Search } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { RegionSearchResult } from "@/modules/regions/region-search";
import { jntLocationSchema, locationSchema, regionLevels, type Region, type RegionList, type SelectedLocation } from "@/modules/regions/region.validation";

const regionLabels = ["Provinsi", "Kota/Kab.", "Kecamatan", "Desa"];
const clientCache = new Map<string, { list: RegionList; expires: number }>();
export function RegionSelectorDialog({ value, onChange, jntCheckout = false }: { value: SelectedLocation | null; onChange: (value: SelectedLocation) => void; jntCheckout?: boolean }) {
  const lastStep = jntCheckout ? 3 : 4;
  const labels = regionLabels.slice(0, lastStep);
  const schema = jntCheckout ? jntLocationSchema : locationSchema;
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState<Region[]>([]);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [postal, setPostal] = useState("");
  const [village, setVillage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [state, setState] = useState<{ key: string; list?: RegionList; error?: boolean }>({ key: "" });
  const [retry, setRetry] = useState(0);
  const searchTerm = query.trim();
  const searching = searchTerm.length >= 2;
  const [search, setSearch] = useState<{ term: string; results?: RegionSearchResult[]; error?: boolean }>({ term: "" });
  useEffect(() => {
    if (!open || !searching) return;
    const controller = new AbortController();
    setSearch({ term: searchTerm });
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ level: "provinces", q: searchTerm });
        if (jntCheckout) params.set("source", "jnt-checkout");
        const response = await fetch("/api/v1/regions?" + params, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("search");
        if (!controller.signal.aborted) setSearch({ term: searchTerm, results: result.data.results });
      } catch {
        if (!controller.signal.aborted) setSearch({ term: searchTerm, error: true });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, searching, searchTerm, jntCheckout, retry]);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => { if (step === lastStep) confirmRef.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [open, step, lastStep]);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const resize = () => {
      dialogRef.current?.style.setProperty("--region-height", `${viewport?.height ?? window.innerHeight}px`);
      dialogRef.current?.style.setProperty("--region-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".storefront-checkout-root, .storefront-root")), []);
  const parent = step ? draft[step - 1]?.code : "";
  const province = draft[0]?.code ?? "";
  const key = step < lastStep ? `${jntCheckout ? "jnt:" + province : "manual"}:${regionLevels[step]}:${parent || ""}` : "done";
  useEffect(() => {
    if (!open || step === lastStep || parent === undefined) return;
    const cached = clientCache.get(key);
    if (!jntCheckout && cached && cached.expires > Date.now()) { setState({ key, list: cached.list }); return; }
    const controller = new AbortController();
    setState({ key });
    const params = new URLSearchParams({ level: regionLevels[step], parent });
    if (jntCheckout) { params.set("source", "jnt-checkout"); params.set("province", province); }
    fetch("/api/v1/regions?" + params, { signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("regions");
        return result.data as RegionList;
      }).then(list => {
        if (controller.signal.aborted) return;
        if (!jntCheckout) {
          if (clientCache.size >= 128) clientCache.delete(clientCache.keys().next().value!);
          clientCache.set(key, { list, expires: Date.now() + 300_000 });
        }
        setState({ key, list });
      }).catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => controller.abort();
  }, [open, key, parent, step, retry, jntCheckout, lastStep, province]);
  function changeOpen(next: boolean) {
    if (next) {
      setDraft(value ? [
        { code: value.provinceCode, name: value.province }, { code: value.cityCode, name: value.city },
        { code: value.districtCode, name: value.district },
        ...(!jntCheckout ? [{ code: value.villageCode, name: value.village, postalCode: value.postalCode }] : []),
      ] : []);
      setPostal(value?.postalCode || ""); setUpdatedAt(value?.regionUpdatedAt || "");
      setVillage(value?.village || "");
      setStep(value ? lastStep : 0); setQuery("");
    }
    setOpen(next);
  }
  const list = state.key === key ? state.list : undefined;
  const filtered = list?.data.filter(r => r.name.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id")));
  const codes = { provinceCode: draft[0]?.code, cityCode: draft[1]?.code, districtCode: draft[2]?.code, villageCode: jntCheckout ? "" : draft[3]?.code, postalCode: postal, village: jntCheckout ? village : draft[3]?.name };
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className="region-trigger" data-testid="select-location">
        <MapPin size={20} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-left">
          <strong className="block text-sm">{value ? [value.village, value.district].filter(Boolean).join(", ") : "Pilih Lokasi Pengiriman"}</strong>
          <span className="block text-xs text-ink-soft">{value ? `${value.city}, ${value.province} ${value.postalCode}` : jntCheckout ? "Pilih Provinsi, Kota/Kabupaten, dan Kecamatan J&T." : "Pilih Provinsi, Kota/Kabupaten, Kecamatan, dan Desa/Kelurahan."}</span>
        </span><ChevronRight size={18} aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal container={container}>
      <Dialog.Overlay className="region-overlay" />
      <Dialog.Content ref={dialogRef} className="region-dialog region-page" data-testid="region-dialog" aria-describedby={undefined}>
        <div className="region-page-header">
          <div className="region-page-title">
            <Dialog.Close asChild><button type="button" className="region-back" aria-label="Kembali ke checkout"><ArrowLeft size={24} /></button></Dialog.Close>
            <Dialog.Title className="font-display text-xl font-bold">Provinsi, Kota, Kecamatan</Dialog.Title>
          </div>
          <Label htmlFor="region-search" className="sr-only">Cari provinsi, kota, kecamatan</Label>
          <div className="region-page-search"><Search size={22} aria-hidden="true" /><Input ref={searchRef} id="region-search" value={query} onChange={e => setQuery(e.target.value)} maxLength={80} placeholder="Cari provinsi, kota, kecamatan" autoComplete="off" /></div>
        </div>
        <div className="region-page-body">
          <div className="region-selection-heading"><strong>Lokasi Terpilih</strong><button type="button" onClick={() => { setDraft([]); setStep(0); setQuery(""); setPostal(""); setVillage(""); }}>Atur Ulang</button></div>
          <nav className="region-selection" aria-label="Lokasi terpilih">
            {labels.slice(0, Math.min(draft.length + 1, lastStep)).map((label, i) => <button key={label} type="button" aria-current={step === i ? "step" : undefined} onClick={() => { setStep(i); setQuery(""); }}><span className="region-selection-dot" /><span>{draft[i]?.name || `Pilih ${label}`}</span></button>)}
          </nav>
        {step < lastStep || searching ? <>
          <h3 className="region-list-title">{searching ? "Hasil Pencarian" : `Pilih ${labels[step]}`}</h3>
          {searching ? <div className="region-options" aria-live="polite" aria-busy={search.term !== searchTerm || (!search.results && !search.error)}>
            {search.term !== searchTerm || (!search.results && !search.error) ? <p role="status">Mencari wilayah…</p> : search.error ? <div role="alert"><p>Pencarian gagal. Coba lagi.</p><Button type="button" variant="outline" onClick={() => setRetry(n => n + 1)}>Coba lagi</Button></div> : !search.results?.length ? <p>Tidak ada wilayah yang cocok. Coba nama lain.</p> : <ul>{search.results.map(result => <li key={JSON.stringify(result.path.map(region => region.code))}>
              <button type="button" className="region-option" onClick={() => {
                setDraft(result.path); setPostal(""); setVillage(""); setUpdatedAt(result.updatedAt);
                setStep(result.path.length); setQuery("");
                searchRef.current?.blur();
              }}><MapPin size={24} aria-hidden="true" /><span><strong className="block">{result.path.at(-1)!.name}</strong><span className="block text-xs text-ink-soft">{result.path.slice(0, -1).map(region => region.name).join(" / ") || "Provinsi"}</span></span></button>
            </li>)}</ul>}
          </div> :
          <div className="region-options" aria-label={labels[step]} aria-busy={!list && !state.error}>
            {state.key === key && state.error ? <div role="alert" className="space-y-3 p-3"><p>Gagal memuat wilayah. Coba lagi.</p><Button type="button" variant="outline" onClick={() => setRetry(n => n + 1)}>Coba lagi</Button></div> : !list ? <p role="status" className="p-3 text-sm">Memuat {labels[step].toLowerCase()}…</p> : !filtered?.length ? <p role="status" className="p-3 text-sm">Wilayah tidak ditemukan. Coba kata lain.</p> : <ul>{filtered.map(region => <li key={region.code}>
              <button type="button" className="region-option" aria-pressed={draft[step]?.code === region.code} onClick={() => {
                setDraft([...draft.slice(0, step), region]); setPostal(step === 3 ? region.postalCode || "" : ""); setVillage("");
                setUpdatedAt(list.updatedAt); setQuery(""); setStep(step + 1);
                searchRef.current?.blur();
              }}><MapPin size={24} aria-hidden="true" /><span>{region.name}</span>{draft[step]?.code === region.code && <Check size={18} aria-hidden="true" />}</button>
            </li>)}</ul>}
          </div>}
        </> : <div className="min-h-0 space-y-4 overflow-y-auto py-2">
          <div><Label htmlFor="region-village">Desa/Kelurahan</Label><Input id="region-village" maxLength={150} value={jntCheckout ? village : draft[3]?.name ?? ""} readOnly={!jntCheckout} placeholder="Nama desa atau kelurahan" onChange={e => setVillage(e.target.value)} /></div>
          <Button ref={confirmRef} type="button" className="w-full" disabled={!schema.safeParse(codes).success || (jntCheckout && !village.trim())} onClick={() => {
            const parsed = schema.parse(codes);
            onChange({ ...parsed, province: draft[0].name, city: draft[1].name, district: draft[2].name, village: jntCheckout ? village.trim() : draft[3]?.name ?? "", regionSource: jntCheckout ? "jnt-mapping" : "emsifa-v2", regionUpdatedAt: updatedAt });
            setOpen(false);
          }}>Gunakan lokasi ini</Button>
        </div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
