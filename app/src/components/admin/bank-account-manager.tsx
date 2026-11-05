"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createBankAccountAction, toggleBankAccountAction } from "@/modules/payments/bank.actions";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} data-testid="bank-submit">{pending ? "Menyimpan..." : "Tambah Rekening"}</Button>;
}

export function BankAccountManager({
  accounts,
}: {
  accounts: { id: string; bankName: string; accountNumber: string; accountHolder: string; displayName: string; isActive: boolean }[];
}) {
  const [state, action] = useFormState(createBankAccountAction, { ok: false } as any);
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border border-line bg-white p-4" data-testid={`bank-${a.id}`}>
            <div>
              <p className="font-semibold text-ink">{a.displayName}</p>
              <p className="text-xs text-ink-muted">{a.bankName} · {a.accountNumber} · a.n {a.accountHolder}</p>
            </div>
            <button onClick={() => start(async () => { await toggleBankAccountAction(a.id); router.refresh(); })} disabled={pending} data-testid={`bank-toggle-${a.id}`}>
              <Badge variant={a.isActive ? "success" : "muted"}>{a.isActive ? "Aktif" : "Nonaktif"}</Badge>
            </button>
          </div>
        ))}
      </div>

      <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-5" data-testid="bank-form">
        <h2 className="font-display font-bold text-ink">Tambah Rekening</h2>
        <div><Label>Nama Bank</Label><Input name="bankName" placeholder="BCA" required /></div>
        <div><Label>Nomor Rekening</Label><Input name="accountNumber" required /></div>
        <div><Label>Atas Nama</Label><Input name="accountHolder" required /></div>
        <div><Label>Nama Tampilan</Label><Input name="displayName" placeholder="BCA - Nama Pemilik Rekening" required /></div>
        {state?.ok === false && state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.ok && <p className="text-sm text-success">Rekening ditambahkan.</p>}
        <Submit />
      </form>
    </div>
  );
}
