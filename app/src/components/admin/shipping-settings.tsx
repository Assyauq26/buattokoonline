"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { maxManualShippingCost } from "@/modules/shipping/shipping-settings-input";

export async function shippingRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(json.error?.message || "Permintaan pengiriman gagal");
  return json.data as T;
}
export function shippingJson(method: "POST" | "PUT", input: unknown) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) };
}

export type ShippingStatus = {
  manualFlat: number | null;
  activeEnvironment: string | null;
  activeMappingVersion: string | null;
  checks: { label: string; ready: boolean; reason?: string }[];
};

export function ShippingSettings({ manualFlat, activeEnvironment }: Pick<ShippingStatus, "manualFlat" | "activeEnvironment">) {
  const [active, setActive] = useState(activeEnvironment);
  const [choice, setChoice] = useState(activeEnvironment ? "jnt" : "manual");
  const [cost, setCost] = useState(manualFlat?.toString() ?? "");
  const [configured, setConfigured] = useState(manualFlat !== null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+$/.test(cost) || Number(cost) > maxManualShippingCost) {
      setNotice("Masukkan rupiah bulat dari 0 sampai Rp100.000.000.");
      return;
    }
    setBusy(true);
    try {
      const saved = await shippingRequest<ShippingStatus>("/api/v1/admin/shipping/settings", shippingJson("PUT", { method: "manual", cost: Number(cost) }));
      setActive(saved.activeEnvironment);
      setConfigured(true);
      setNotice("Ongkir flat disimpan dan Pengiriman Manual aktif.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <h2 className="text-lg font-semibold">Pengaturan Pengiriman</h2>
    <p className="text-sm">Checkout aktif menggunakan {active ? "J&T Express · " + active : configured ? "Pengiriman Manual" : "Manual · tarif belum ditetapkan"}.</p>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="text-sm font-semibold">Metode yang ingin diatur</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {[["manual", "Pengiriman Manual"], ["jnt", "J&T Express API"]].map(([value, label]) =>
          <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl bg-zinc-100 px-4">
            <input type="radio" name="shipping-method" checked={choice === value} onChange={() => setChoice(value)} />{label}
          </label>)}
      </div>
      {choice === "manual" ? <>
        <label className="block text-sm font-semibold">Ongkir flat per pesanan (Rp)
          <input required inputMode="numeric" pattern="[0-9]+" maxLength={9} value={cost}
            onChange={event => setCost(event.target.value)} className="mt-1 block h-11 w-full max-w-xs rounded-xl bg-zinc-100 px-3" />
        </label>
        <p className="text-sm text-zinc-600">Ongkir dikenakan sekali per pesanan. Masukkan 0 untuk gratis ongkir.</p>
        <button className="min-h-11 rounded-xl bg-black px-4 text-sm font-semibold text-white" type="submit">Simpan dan aktifkan Manual</button>
      </> : <Link href="/admin/integrations/jnt" className="inline-block text-sm font-semibold underline">Buka konfigurasi J&T Express API</Link>}
    </fieldset>
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </form>;
}
