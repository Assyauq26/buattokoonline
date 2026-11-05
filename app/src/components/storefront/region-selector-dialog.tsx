"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, MapPin, Search, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { locationSchema, regionLevels, type Region, type RegionList, type SelectedLocation } from "@/modules/regions/region.validation";

const labels = ["Provinsi", "Kota/Kabupaten", "Kecamatan", "Desa/Kelurahan"];
const clientCache = new Map<string, { list: RegionList; expires: number }>();
export function RegionSelectorDialog({ value, onChange }: { value: SelectedLocation | null; onChange: (value: SelectedLocation) => void }) {
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState<Region[]>([]);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [postal, setPostal] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [state, setState] = useState<{ key: string; list?: RegionList; error?: boolean }>({ key: "" });
  const [retry, setRetry] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => (step < 4 ? searchRef.current : confirmRef.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, step]);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".storefront-checkout-root, .storefront-root")), []);
  const parent = step ? draft[step - 1]?.code : "";
  const key = step < 4 ? `${regionLevels[step]}:${parent || ""}` : "done";
  useEffect(() => {
    if (!open || step === 4 || parent === undefined) return;
    const cached = clientCache.get(key);
    if (cached && cached.expires > Date.now()) { setState({ key, list: cached.list }); return; }
    const controller = new AbortController();
    setState({ key });
    fetch(`/api/v1/regions?level=${regionLevels[step]}&parent=${encodeURIComponent(parent)}`, { signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("regions");
        return result.data as RegionList;
      }).then(list => {
        if (controller.signal.aborted) return;
        if (clientCache.size >= 128) clientCache.delete(clientCache.keys().next().value!);
        clientCache.set(key, { list, expires: Date.now() + 300_000 });
        setState({ key, list });
      }).catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => controller.abort();
  }, [open, key, parent, step, retry]);
  function changeOpen(next: boolean) {
    if (next) {
      setDraft(value ? [
        { code: value.provinceCode, name: value.province }, { code: value.cityCode, name: value.city },
        { code: value.districtCode, name: value.district }, { code: value.villageCode, name: value.village, postalCode: value.postalCode },
      ] : []);
      setPostal(value?.postalCode || ""); setUpdatedAt(value?.regionUpdatedAt || "");
      setStep(value ? 4 : 0); setQuery("");
    }
    setOpen(next);
  }
  const list = state.key === key ? state.list : undefined;
  const filtered = list?.data.filter(r => r.name.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id")));
  const codes = { provinceCode: draft[0]?.code, cityCode: draft[1]?.code, districtCode: draft[2]?.code, villageCode: draft[3]?.code, postalCode: postal };
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className="region-trigger" data-testid="select-location">
        <MapPin size={20} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-left">
          <strong className="block text-sm">{value ? `${value.village}, ${value.district}` : "Pilih Lokasi Pengiriman"}</strong>
          <span className="block text-xs text-ink-soft">{value ? `${value.city}, ${value.province} ${value.postalCode}` : "Pilih Provinsi, Kota/Kabupaten, Kecamatan, dan Desa/Kelurahan."}</span>
        </span><ChevronRight size={18} aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal container={container}>
      <Dialog.Overlay className="region-overlay" />
      <Dialog.Content className="region-dialog" data-testid="region-dialog">
        <div className="flex items-center justify-between gap-3">
          <Dialog.Title className="font-display text-xl font-bold">Pilih Lokasi</Dialog.Title>
          <Dialog.Close asChild><button type="button" className="region-close" aria-label="Tutup pilihan lokasi"><X size={20} /></button></Dialog.Close>
        </div>
        <Dialog.Description className="text-sm text-ink-soft">Pilih wilayah secara berurutan, lalu konfirmasi lokasi pengiriman.</Dialog.Description>
        <nav className="region-steps" aria-label="Tingkat wilayah">
          {labels.map((label, i) => <button key={label} type="button" disabled={i > draft.length} aria-current={step === i ? "step" : undefined} onClick={() => { setStep(i); setQuery(""); }}>
            <span className="block font-semibold">{label}</span><span className="block truncate">{draft[i]?.name || "Pilih wilayah"}</span>
          </button>)}
        </nav>
        {step < 4 ? <>
          <Label htmlFor="region-search" className="sr-only">Cari {labels[step]}</Label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3" size={18} aria-hidden="true" /><Input ref={searchRef} id="region-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari provinsi / kota / kecamatan / desa..." className="pl-10" autoComplete="off" /></div>
          <div className="region-options" aria-label={labels[step]} aria-busy={!list && !state.error}>
            {state.key === key && state.error ? <div role="alert" className="space-y-3 p-3"><p>Gagal memuat wilayah. Coba lagi.</p><Button type="button" variant="outline" onClick={() => setRetry(n => n + 1)}>Coba lagi</Button></div> : !list ? <p role="status" className="p-3 text-sm">Memuat {labels[step].toLowerCase()}…</p> : !filtered?.length ? <p role="status" className="p-3 text-sm">Wilayah tidak ditemukan. Coba kata lain.</p> : <ul>{filtered.map(region => <li key={region.code}>
              <button type="button" className="region-option" aria-pressed={draft[step]?.code === region.code} onClick={() => {
                setDraft([...draft.slice(0, step), region]); setPostal(step === 3 ? region.postalCode || "" : "");
                setUpdatedAt(list.updatedAt); setQuery(""); setStep(step + 1);
              }}><span>{region.name}</span>{draft[step]?.code === region.code ? <Check size={18} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</button>
            </li>)}</ul>}
          </div>
        </> : <div className="min-h-0 space-y-4 overflow-y-auto py-2">
          <p className="text-sm" data-testid="region-confirm-summary">{draft.map(r => r.name).join(", ")}</p>
          <div><Label htmlFor="region-postal">Kode pos</Label><Input id="region-postal" inputMode="numeric" maxLength={5} value={postal} readOnly={!!draft[3]?.postalCode} onChange={e => setPostal(e.target.value.replace(/\D/g, ""))} /></div>
          {!draft[3]?.postalCode && <p className="text-xs text-ink-soft">Kode pos belum tersedia dari sumber wilayah. Isi kode pos alamat Anda.</p>}
          <Button ref={confirmRef} type="button" className="w-full" disabled={!locationSchema.safeParse(codes).success} onClick={() => {
            const parsed = locationSchema.parse(codes);
            onChange({ ...parsed, province: draft[0].name, city: draft[1].name, district: draft[2].name, village: draft[3].name, regionSource: "emsifa-v2", regionUpdatedAt: updatedAt });
            setOpen(false);
          }}>Gunakan lokasi ini</Button>
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
