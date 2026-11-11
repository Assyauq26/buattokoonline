"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function WhatsAppConsent({ initial }: { initial: boolean }) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/v1/account/whatsapp-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted: value }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error?.message || "Belum tersimpan.");
      setMessage(
        data.data.pending
          ? "Pilihan tersimpan. Sinkronisasi WhatsApp tertunda; Anda juga dapat membalas STOP untuk menghentikan pesan."
          : "Pilihan notifikasi tersimpan.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-line p-4 space-y-3">
      <h2 className="font-semibold">Notifikasi WhatsApp</h2>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="h-5 w-5 accent-current shrink-0"
          checked={value}
          onChange={(e) => setValue(e.target.checked)}
        />
        Saya ingin menerima pembaruan pesanan toko ini melalui WhatsApp.
      </label>
      <p className="text-sm text-muted-foreground">
        Pilihan ini terpisah dari login. Anda dapat berhenti kapan saja dengan
        membalas STOP.
      </p>
      <Button disabled={busy} onClick={save}>
        Simpan pilihan
      </Button>
      <p role="status" className="text-sm">
        {busy ? "Menyimpan…" : message}
      </p>
    </section>
  );
}
