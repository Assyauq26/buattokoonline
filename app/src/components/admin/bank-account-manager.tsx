"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveBankAccountAction, toggleBankAccountAction, deleteBankAccountAction } from "@/modules/payments/bank.actions";

type Account = { id: string; bankName: string; accountNumber: string; accountHolder: string; displayName: string; isActive: boolean; updatedAt: string };
export function BankAccountManager({ accounts }: { accounts: Account[] }) {
  const [editing, setEditing] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  function complete(result: { ok: boolean; error?: string; data?: { message: string } }) {
    setMessage(result.ok ? result.data?.message || "Tersimpan." : result.error || "Tidak dapat menyimpan.");
    if (result.ok) { setEditing(null); router.refresh(); }
  }
  return <div className="grid items-start gap-6 md:grid-cols-2">
    <div className="space-y-3">
      {!accounts.length && <p className="rounded-xl border p-5 text-sm text-zinc-500">Belum ada rekening pembayaran.</p>}
      {accounts.map(a => <article key={a.id} className="rounded-xl border border-zinc-200 bg-white p-4" data-testid={`bank-${a.id}`}>
        <div className="flex items-start justify-between gap-2"><h2 className="break-words font-semibold">{a.displayName}</h2><span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-xs">{a.isActive ? "Aktif" : "Nonaktif"}</span></div>
        <p className="mt-2 break-all text-sm">{a.bankName} · {a.accountNumber}</p><p className="text-sm text-zinc-500">a.n. {a.accountHolder}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => { setEditing(a); setMessage(""); }}>Edit</Button>
          <Button variant="outline" disabled={pending} data-testid={`bank-toggle-${a.id}`} onClick={() => start(async () => complete(await toggleBankAccountAction(a.id, a.updatedAt, !a.isActive)))}>{a.isActive ? "Nonaktifkan" : "Aktifkan"}</Button>
          <Button variant="outline" disabled={pending} onClick={() => { if (window.confirm(`Hapus rekening ${a.displayName} dari pilihan pembayaran? Rincian pembayaran lama tetap disimpan.`)) start(async () => complete(await deleteBankAccountAction(a.id, a.updatedAt))); }}>Hapus</Button>
        </div>
      </article>)}
    </div>
    <form key={editing?.id || "new"} data-testid="bank-form" className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const value = Object.fromEntries(new FormData(form));
      start(async () => { const result = await saveBankAccountAction(editing?.id || null, editing?.updatedAt || "", value); complete(result); if (result.ok) form.reset(); });
    }}>
      <h2 className="font-bold">{editing ? "Edit Rekening" : "Tambah Rekening"}</h2>
      {([['bankName', 'Nama Bank'], ['accountNumber', 'Nomor Rekening'], ['accountHolder', 'Nama Pemilik'], ['displayName', 'Nama Tampilan']] as const).map(([key, label]) => <div key={key}><Label htmlFor={`bank-${key}`}>{label}</Label><Input id={`bank-${key}`} name={key} defaultValue={editing?.[key] || ""} required maxLength={key === "accountNumber" ? 34 : 100} minLength={key === "accountNumber" ? 3 : 2} inputMode={key === "accountNumber" ? "numeric" : "text"} pattern={key === "accountNumber" ? "[0-9]{3,34}" : undefined} disabled={pending} /></div>)}
      {editing && <p className="text-xs text-zinc-500">Perubahan berlaku untuk pembayaran baru. Pesanan lama tetap menyimpan rekening sebelumnya.</p>}
      <div className="flex gap-2"><Button type="submit" disabled={pending} data-testid="bank-submit">{pending ? "Menyimpan…" : "Simpan Rekening"}</Button>{editing && <Button type="button" variant="outline" disabled={pending} onClick={() => setEditing(null)}>Batal</Button>}</div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </div>;
}
