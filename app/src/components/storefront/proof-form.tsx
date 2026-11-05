"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { submitProofAction } from "@/modules/payments/payment.actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="submit-proof-btn">
      {pending ? "Mengunggah..." : "Kirim Konfirmasi"}
    </Button>
  );
}

export function ProofForm({ orderId, amount }: { orderId: string; amount: number }) {
  const [state, action] = useFormState(submitProofAction, { ok: false } as any);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state?.ok, router]);
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-success/40 bg-green-50 p-5 text-sm text-green-700" data-testid="proof-success">
        Konfirmasi terkirim! Pembayaran sedang diverifikasi admin.
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line p-5" data-testid="proof-form">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Bank Pengirim</Label><Input name="senderBank" placeholder="BCA" required data-testid="proof-sender-bank" /></div>
        <div><Label>Nama Pengirim</Label><Input name="senderName" required data-testid="proof-sender-name" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Nominal Transfer</Label><Input name="amount" type="number" defaultValue={amount} required data-testid="proof-amount" /></div>
        <div><Label>Tanggal Transfer</Label><Input name="transferDate" type="date" required data-testid="proof-date" /></div>
      </div>
      <div>
        <Label>Bukti Transfer (JPG/PNG/WebP/PDF, maks 4 MB)</Label>
        <Input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required data-testid="proof-file" className="pt-2.5" />
      </div>
      <div><Label>Catatan (opsional)</Label><Textarea name="note" /></div>
      {state?.ok === false && state?.error && <p className="text-sm text-destructive" data-testid="proof-error">{state.error}</p>}
      <SubmitBtn />
    </form>
  );
}
