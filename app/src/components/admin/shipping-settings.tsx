"use client";

import { useState, type FormEvent } from "react";
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
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Pengiriman Manual</h2>
      <button type="button" role="switch" aria-label="Aktifkan Pengiriman Manual" aria-checked={!active && configured} disabled={busy}
        onClick={async () => {
          if (!active && configured) {
            setBusy(true);
            try {
              const environments = activeEnvironment ? [activeEnvironment] : ["production", "sandbox"];
              let readyEnvironment: string | undefined;
              for (const environment of environments) {
                const status = await shippingRequest<ShippingStatus>("/api/v1/admin/shipping/settings?environment=" + environment);
                if (status.checks.length && status.checks.every(check => check.ready)) { readyEnvironment = environment; break; }
              }
              if (!readyEnvironment) throw new Error("Belum ada konfigurasi J&T yang siap.");
              const saved = await shippingRequest<ShippingStatus>("/api/v1/admin/shipping/settings", shippingJson("PUT", { method: "jnt", environment: readyEnvironment }));
              setActive(saved.activeEnvironment); setNotice("Pengiriman Manual dinonaktifkan; J&T aktif.");
            } catch (error) { setNotice("Simpan konfigurasi J&T yang siap digunakan terlebih dahulu. " + (error as Error).message); }
            finally { setBusy(false); }
            return;
          }
          if (!/^\d+$/.test(cost)) { setNotice("Isi tarif Manual terlebih dahulu."); return; }
          setBusy(true);
          try {
            const saved = await shippingRequest<ShippingStatus>("/api/v1/admin/shipping/settings", shippingJson("PUT", { method: "manual", cost: Number(cost) }));
            setActive(saved.activeEnvironment); setConfigured(true); setNotice("Pengiriman Manual aktif.");
          } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
        }} className={"relative h-6 w-11 rounded-full " + (!active && configured ? "bg-red-600" : "bg-zinc-300")}>
        <span className={"absolute top-1 h-4 w-4 rounded-full bg-white " + (!active && configured ? "right-1" : "left-1")} />
      </button></div>
    <p className="text-sm">Checkout aktif menggunakan {active ? "J&T Express · " + active : configured ? "Pengiriman Manual" : "Manual · tarif belum ditetapkan"}.</p>
    <fieldset disabled={busy} className="space-y-4">
      {<>
        <label className="block text-sm font-semibold">Ongkir flat per pesanan (Rp)
          <input required inputMode="numeric" pattern="[0-9]+" maxLength={9} value={cost}
            onChange={event => setCost(event.target.value)} className="mt-1 block h-11 w-full max-w-xs rounded-xl bg-zinc-100 px-3" />
        </label>
        <p className="text-sm text-zinc-600">Ongkir dikenakan sekali per pesanan. Masukkan 0 untuk gratis ongkir.</p>
        <button className="min-h-11 rounded-xl bg-black px-4 text-sm font-semibold text-white" type="submit">Simpan dan aktifkan Manual</button>
      </>}
    </fieldset>
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </form>;
}
