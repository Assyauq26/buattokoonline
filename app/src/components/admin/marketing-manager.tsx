"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatIDR } from "@/lib/money";
import { formatWibDate, voucherStatusAt } from "@/modules/promotions/marketing-display";
import { saveVoucherAction, toggleVoucherAction } from "@/modules/promotions/marketing.actions";

type Voucher = {
  id: string; code: string; discountType: "PERCENT" | "FIXED"; discountValue: number;
  minSpend: number; maxDiscount: number | null; isActive: boolean; startsAt: string | null; expiresAt: string | null;
  usageLimit: number | null; perUserLimit: number | null; usedCount: number; createdAt: string;
};
type VoucherDraft = {
  code: string; discountType: "PERCENT" | "FIXED"; discountValue: string;
  minSpend: string; maxDiscount: string; startsAt: string; expiresAt: string; usageLimit: string; perUserLimit: string; isActive: boolean;
};
const initial: VoucherDraft = {
  code: "", discountType: "PERCENT", discountValue: "10",
  minSpend: "0", maxDiscount: "", startsAt: "", expiresAt: "", usageLimit: "", perUserLimit: "", isActive: true,
};
const localDate = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export function MarketingManager({ vouchers, canCreate, canUpdate, asOfMs }: {
  vouchers: Voucher[]; canCreate: boolean; canUpdate: boolean; asOfMs: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoucherDraft>(initial);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  // SSR and the initial browser render must agree, even at a time boundary.
  // Update status after hydration and periodically while the page stays open.
  const [nowMs, setNowMs] = useState(asOfMs);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [asOfMs]);
  const setField = <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => setDraft(v => ({ ...v, [key]: value }));
  const notice = (kind: "error" | "success", text: string) => setFeedback({ kind, text });
  function beginEdit(v: Voucher) {
    setEditing(v.id); setDraft({
      code: v.code, discountType: v.discountType, discountValue: String(v.discountValue),
      minSpend: String(v.minSpend), maxDiscount: v.maxDiscount == null ? "" : String(v.maxDiscount),
      startsAt: localDate(v.startsAt), expiresAt: localDate(v.expiresAt),
      usageLimit: v.usageLimit == null ? "" : String(v.usageLimit),
      perUserLimit: v.perUserLimit == null ? "" : String(v.perUserLimit), isActive: v.isActive,
    }); setFeedback(null);
    document.getElementById("voucher-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function submitVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setFeedback(null);
    try {
      const result = await saveVoucherAction(editing, {
        code: draft.code.trim().toUpperCase(), discountType: draft.discountType,
        discountValue: Number(draft.discountValue), minSpend: Number(draft.minSpend),
        maxDiscount: draft.maxDiscount.trim() ? Number(draft.maxDiscount) : null,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        usageLimit: draft.usageLimit.trim() ? Number(draft.usageLimit) : null,
        perUserLimit: draft.perUserLimit.trim() ? Number(draft.perUserLimit) : null,
        isActive: draft.isActive,
      });
      if (!result.ok) { notice("error", result.error || "Voucher gagal disimpan"); return; }
      setDraft(initial); setEditing(null); notice("success", "Voucher berhasil disimpan."); router.refresh();
    } catch { notice("error", "Gagal menghubungi server."); }
    finally { setPending(false); }
  }
  async function toggle(v: Voucher) {
    setPending(true); setFeedback(null);
    try {
      const result = await toggleVoucherAction(v.id, !v.isActive);
      if (!result.ok) notice("error", result.error || "Gagal memperbarui voucher");
      else { notice("success", "Status voucher diperbarui."); router.refresh(); }
    } catch { notice("error", "Gagal menghubungi server."); }
    finally { setPending(false); }
  }
  return <div className="space-y-8">
    {feedback && <div tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"}
      className={`rounded-xl border p-3 text-sm ${feedback.kind === "error" ? "border-destructive text-destructive" : "border-line bg-white text-ink"}`}
      data-testid="marketing-feedback">{feedback.text}</div>}

    <section id="voucher" className="space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2"><BadgePercent size={20}/><h2 className="text-xl font-bold">Voucher diskon</h2></div>
      <p className="text-sm text-ink-soft">Voucher berlaku saat pembeli mengisi kode di checkout. Diskon persentase maupun nominal diproses di server.</p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(290px,0.9fr)]">
        <div className="min-w-0 rounded-2xl border border-line bg-white">
          {!vouchers.length ? <p className="p-5 text-sm text-ink-soft">Belum ada voucher. Buat voucher pertama melalui formulir.</p>
            : <ul className="divide-y divide-line">{vouchers.map(v => <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><p className="break-all font-semibold">{v.code}</p>
                  <span className="rounded-full bg-surface px-2 py-1 text-xs">{voucherStatusAt(v, nowMs)}</span></div>
                <p className="text-sm">{v.discountType === "PERCENT" ? `${v.discountValue}%` : formatIDR(v.discountValue)} diskon · Min. belanja {formatIDR(v.minSpend)}</p>
                <p className="text-xs text-ink-soft">{v.maxDiscount ? `Batas diskon ${formatIDR(v.maxDiscount)} · ` : ""}{v.startsAt ? `Mulai ${formatWibDate(v.startsAt)} · ` : ""}{v.expiresAt ? `Berakhir ${formatWibDate(v.expiresAt)}` : "Tanpa tanggal berakhir"}</p>
                <p className="text-xs text-ink-soft">{v.usedCount} terpakai/ditahan{v.usageLimit != null ? ` / ${v.usageLimit} kuota` : " · tanpa batas total"}{v.perUserLimit != null ? ` · Maks. ${v.perUserLimit} per pelanggan` : ""}</p>
              </div>
              {canUpdate && <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => beginEdit(v)}>Edit<span className="sr-only"> {v.code}</span></Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => toggle(v)}>{v.isActive ? "Nonaktifkan" : "Aktifkan"}<span className="sr-only"> {v.code}</span></Button></div>}
            </li>)}</ul>}
          {vouchers.length === 100 && <p className="p-4 text-xs text-ink-soft">Menampilkan 100 voucher terbaru.</p>}
        </div>
        {(canCreate || (editing && canUpdate)) && <form id="voucher-editor" onSubmit={submitVoucher}
          className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-5 scroll-mt-24">
          <h3 className="font-semibold">{editing ? "Edit voucher" : "Buat voucher"}</h3>
          <fieldset disabled={pending} className="space-y-3">
            <div><Label htmlFor="voucher-code">Kode voucher</Label><Input id="voucher-code" value={draft.code}
              onChange={e => setField("code", e.target.value.toUpperCase())} disabled={!!editing} required minLength={3} maxLength={32} placeholder="GHEVER10"/></div>
            <div><Label htmlFor="voucher-type">Jenis diskon</Label><select id="voucher-type" value={draft.discountType}
              onChange={e => setField("discountType", e.target.value as VoucherDraft["discountType"])}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"><option value="PERCENT">Persentase (%)</option><option value="FIXED">Nominal (Rp)</option></select></div>
            <div><Label htmlFor="voucher-value">Nilai diskon ({draft.discountType === "PERCENT" ? "%" : "Rp"})</Label>
              <Input id="voucher-value" type="number" min={1} max={draft.discountType === "PERCENT" ? 100 : 2147483647} step={1}
                value={draft.discountValue} onChange={e => setField("discountValue", e.target.value)} required /></div>
            <div><Label htmlFor="voucher-min">Minimal belanja (Rp)</Label><Input id="voucher-min" type="number" min={0} step={1} value={draft.minSpend} onChange={e => setField("minSpend", e.target.value)} required /></div>
            <div><Label htmlFor="voucher-max">Maksimal diskon (Rp, opsional)</Label><Input id="voucher-max" type="number" min={1} step={1} value={draft.maxDiscount}
              onChange={e => setField("maxDiscount", e.target.value)} placeholder="Tanpa batas tambahan"/></div>
<div><Label htmlFor="voucher-start">Mulai berlaku (opsional)</Label><Input id="voucher-start" type="datetime-local" value={draft.startsAt}
              onChange={e => setField("startsAt", e.target.value)}/></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="voucher-limit">Kuota total (opsional)</Label><Input id="voucher-limit" type="number" min={1} max={1000000} step={1}
                value={draft.usageLimit} onChange={e => setField("usageLimit", e.target.value)} placeholder="Tanpa batas"/></div>
              <div><Label htmlFor="voucher-per-customer">Batas per pelanggan</Label><Input id="voucher-per-customer" type="number" min={1} max={1000000} step={1}
                value={draft.perUserLimit} onChange={e => setField("perUserLimit", e.target.value)} placeholder="Tanpa batas"/></div>
            </div>
            <div><Label htmlFor="voucher-expiry">Berakhir (opsional)</Label><Input id="voucher-expiry" type="datetime-local" value={draft.expiresAt}
              onChange={e => setField("expiresAt", e.target.value)}/></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive}
              onChange={e => setField("isActive", e.target.checked)} className="accent-black"/> Voucher aktif</label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : editing ? "Simpan perubahan" : "Buat voucher"}</Button>
              {editing && <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setDraft(initial); }}>Batal edit</Button>}</div>
          </fieldset>
        </form>}
      </div>
    </section>

  </div>;
}
