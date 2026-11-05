"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { JntMappingSettings, readMapping, type MappingStatus } from "./jnt-mapping-settings";
import { shippingJson, shippingRequest, type ShippingStatus } from "./shipping-settings";

const integration = "/api/v1/admin/integrations/jnt";
const settings = "/api/v1/admin/shipping/settings";
const emptyEndpoints = { order: "", tariff: "", tracking: "", cancellation: "" };
const emptyWarehouse = { name: "", contact: "", phone: "", address: "", districtCode: "" };
const groups = [
  { kind: "order", label: "1. Order", fields: [["orderKey", "Key"], ["orderUsername", "Username"], ["orderApiKey", "API Key"]] },
  { kind: "tariff", label: "2. Tariff Check", fields: [["tariffKey", "Key"], ["tariffCustomer", "Customer Name"]] },
  { kind: "tracking", label: "3. Tracking", fields: [["trackingUsername", "Username / e-company ID"], ["trackingPassword", "Password Track"]] },
  { kind: "cancellation", label: "4. Cancellation", fields: [["cancellationKey", "Key"], ["cancellationUsername", "Username"], ["cancellationApiKey", "API Key"]] },
] as const;
type Endpoint = keyof typeof emptyEndpoints;
type Env = "sandbox" | "production";
type Stored = { configured: boolean; endpoints: typeof emptyEndpoints | null; sharedCancellation: boolean; credentialSet: Record<string, boolean>;
  seller: { warehouse: Omit<typeof emptyWarehouse, "districtCode"> & { districtCode?: string }; selectedServices?: string[]; services: { verificationReference: string; validUntil: string }[] } | null };
const field = "mt-1 block min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500";

export function JntIntegrationSettings() {
  const [environment, setEnvironment] = useState<Env>("sandbox");
  const [mapping, setMapping] = useState<MappingStatus | null>(null);
  return <div className="space-y-5">
    <Link href="/admin/shipping" className="text-sm font-semibold underline">Pengiriman / API J&T Express</Link>
    <h1 className="font-display text-2xl font-bold">Integrasi J&T Express</h1>
    <p className="text-sm text-zinc-600">Hubungkan layanan J&T Express untuk pengiriman toko Anda.</p>
    <JntEnvironmentSettings key={environment} environment={environment} setEnvironment={setEnvironment} mapping={mapping} setMapping={setMapping} />
  </div>;
}

function JntEnvironmentSettings({ environment, setEnvironment, mapping, setMapping }: {
  environment: Env; setEnvironment: (env: Env) => void; mapping: MappingStatus | null; setMapping: (value: MappingStatus) => void;
}) {
  const [endpoints, setEndpoints] = useState(emptyEndpoints);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [stored, setStored] = useState<Stored>();
  const [shipping, setShipping] = useState<ShippingStatus>();
  const [warehouse, setWarehouse] = useState(emptyWarehouse);
  const [sharedCancellation, setSharedCancellation] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>(["EZ"]);
  const [serviceReference, setServiceReference] = useState("");
  const [serviceExpiry, setServiceExpiry] = useState("");
  const [tests, setTests] = useState<Partial<Record<Endpoint, string>>>({});
  const [proof, setProof] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([shippingRequest<Stored>(integration + "?environment=" + environment),
      shippingRequest<ShippingStatus>(settings + "?environment=" + environment), readMapping()])
      .then(([data, status, maps]) => {
        if (!alive) return;
        setStored(data); setShipping(status); setMapping(maps); setEnabled(status.activeEnvironment === environment);
        setEndpoints(data.endpoints ?? {
          order: (environment === "sandbox" ? "https://demo-ecommerce.inuat-jntexpress.id" : "https://api.jet.co.id") + "/jts-idn-ecommerce-api/api/order/create",
          cancellation: (environment === "sandbox" ? "https://demo-ecommerce.inuat-jntexpress.id" : "https://api.jet.co.id") + "/jts-idn-ecommerce-api/api/order/cancel",
          tariff: (environment === "sandbox" ? "https://demo-general.inuat-jntexpress.id" : "https://partner-track.jet.co.id") + "/jandt_track/inquiry.action",
          tracking: (environment === "sandbox" ? "https://demo-general.inuat-jntexpress.id" : "https://partner-track.jet.co.id") + "/jandt_track/track/trackAction!tracking.action",
        });
        setSharedCancellation(data.configured && data.sharedCancellation);
        if (data.seller) {
          const { name, contact, phone, address, districtCode } = data.seller.warehouse;
          setWarehouse({ name, contact, phone, address, districtCode: districtCode || "" });
          setSelectedServices(data.seller.selectedServices || ["EZ"]);
          setServiceReference(data.seller.services[0]?.verificationReference || "");
          setServiceExpiry(data.seller.services[0]?.validUntil.slice(0, 10) || "");
        }
      }).catch(error => { if (alive) setNotice((error as Error).message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [environment, setMapping]);

  function clearTests() { setTests({}); setProof(undefined); }
  function edited() { setDirty(true); clearTests(); }
  function draft() {
    return { environment, endpoints, credentials, sharedCancellation, seller: { warehouse: { ...warehouse, contact: warehouse.name, phone: warehouse.phone.replace(/^0/, "+62").replace(/^62/, "+62") }, selectedServices,
      services: serviceReference && serviceExpiry ? [{ code: "EZ", verificationReference: serviceReference,
        validUntil: new Date(serviceExpiry + "T23:59:59.000Z").toISOString() }] : [] } };
  }
  async function refresh() {
    setShipping(await shippingRequest<ShippingStatus>(settings + "?environment=" + environment));
  }
  async function mappingChanged() {
    const maps = await readMapping();
    if (maps.activeVersion !== mapping?.activeVersion) { clearTests(); }
    setMapping(maps);
    await refresh();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      const data = await shippingRequest<Stored>(integration, shippingJson("PUT", { ...draft(), tariffProof: proof }));
      setStored(data); setCredentials({}); setDirty(false); setProof(undefined);
      if (enabled) await shippingRequest(settings, shippingJson("PUT", { method: "jnt", environment }));
      else if (shipping?.activeEnvironment === environment) {
        if (shipping.manualFlat === null) throw new Error("Konfigurasi tersimpan. Tetapkan tarif Manual sebelum menonaktifkan J&T.");
        await shippingRequest(settings, shippingJson("PUT", { method: "manual", cost: shipping.manualFlat }));
      }
      await refresh(); setNotice("Konfigurasi tersimpan.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function testAll() {
    setBusy(true); setNotice(""); setTests({});
    try {
      const result = await shippingRequest<{ message: string; results: { endpoint: Endpoint; message: string }[] }>(integration + "/test",
        shippingJson("POST", { draft: draft(), endpoint: "all" }));
      setTests(Object.fromEntries(result.results.map(item => [item.endpoint, item.message])));
      setNotice(result.message);
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  const card = "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm";
  function credentialFields(group: typeof groups[number]) {
    return <div className="space-y-2">
      {group.kind === "cancellation" && <label className="flex gap-2 text-sm"><input type="checkbox" checked={sharedCancellation} onChange={event => { setSharedCancellation(event.target.checked); edited(); }} />Gunakan kredensial Order</label>}
      {(group.kind !== "cancellation" || !sharedCancellation) && group.fields.map(([key, label]) =>
        <label key={key} className="grid items-center gap-2 text-sm sm:grid-cols-[120px_1fr]">
          <span>{label}</span><input aria-label={group.kind + " " + label} type="password" autoComplete="new-password" maxLength={300} className={field}
            placeholder={stored?.credentialSet[key] ? "Tersimpan" : "Masukkan " + label.toLowerCase()} value={credentials[key] || ""}
            onChange={event => { setCredentials(previous => ({ ...previous, [key]: event.target.value })); edited(); }} />
        </label>)}
    </div>;
  }
  return <form onSubmit={save} className="space-y-4">
    <section className={card + " flex flex-wrap items-center justify-between gap-4"}>
      <div><div className="flex items-center gap-3"><span className={shipping?.activeEnvironment ? "h-3 w-3 rounded-full bg-emerald-500" : "h-3 w-3 rounded-full bg-amber-500"} /><strong>Status: {shipping?.activeEnvironment ? "Aktif" : "Belum aktif"}</strong>
        <button type="button" role="switch" aria-label="Aktifkan J&T Express" aria-checked={enabled} disabled={busy} onClick={() => { setEnabled(previous => !previous); setDirty(true); }}
          className={"relative h-6 w-11 rounded-full disabled:opacity-50 " + (enabled ? "bg-red-600" : "bg-zinc-300")}>
          <span className={"absolute top-1 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none " + (enabled ? "left-1 translate-x-5" : "left-1")} />
        </button></div><p className="ml-6 mt-1 text-sm text-zinc-500">Checkout saat ini menggunakan {shipping?.activeEnvironment ? "J&T Express" : "Pengiriman Manual"}.</p></div>
      <label className="w-full text-xs sm:w-56">Environment<select className={field} disabled={busy} value={environment} onChange={event => setEnvironment(event.target.value as Env)}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
    </section>
    <fieldset disabled={busy || !stored} className={card + " space-y-4"}>
      <div><h2 className="text-lg font-bold">1. Kredensial API</h2><p className="text-sm text-zinc-600">Masukkan kredensial API J&T sesuai dengan layanan yang digunakan.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">{groups.slice(0, 2).map(group => <section key={group.kind} className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4">
        <h3 className="mb-4 border-l-4 border-red-600 pl-3 font-semibold">{group.label.slice(3)}</h3>{credentialFields(group)}
      </section>)}</div>
      {groups.slice(2).map(group => <details key={group.kind} className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3"><summary className="cursor-pointer text-sm font-semibold">{group.label.slice(3)}</summary><div className="pt-3">{credentialFields(group)}</div></details>)}
      <details><summary className="cursor-pointer text-sm">Pengaturan endpoint lanjutan</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{groups.map(group => <label key={group.kind} className="text-sm">{group.label.slice(3)}<input type="url" className={field} maxLength={350} value={endpoints[group.kind]} onChange={event => { setEndpoints(previous => ({ ...previous, [group.kind]: event.target.value })); edited(); }} /></label>)}</div></details>
    </fieldset>
    <fieldset disabled={busy || !stored} className={card + " space-y-4"}>
      <div><h2 className="text-lg font-bold">2. Gudang Pengirim</h2><p className="text-sm text-zinc-600">Lengkapi alamat gudang untuk pengiriman toko Anda.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Nama<input required maxLength={30} className={field} value={warehouse.name} onChange={event => { setWarehouse(previous => ({ ...previous, name: event.target.value })); edited(); }} /></label>
        <label className="text-sm">Nomor telepon<input required type="tel" maxLength={15} placeholder="081234567890" className={field} value={warehouse.phone} onChange={event => { setWarehouse(previous => ({ ...previous, phone: event.target.value })); edited(); }} /></label>
      </div>
      <WarehouseRegions value={warehouse.districtCode} onChange={districtCode => { setWarehouse(previous => ({ ...previous, districtCode })); edited(); }} />
      <label className="block text-sm">Alamat lengkap<textarea required maxLength={200} rows={2} className={field} value={warehouse.address} onChange={event => { setWarehouse(previous => ({ ...previous, address: event.target.value })); edited(); }} /></label>
    </fieldset>
    <fieldset disabled={busy || !stored}><JntMappingSettings state={mapping} onChange={mappingChanged} /></fieldset>
    <fieldset disabled={busy || !stored} className={card + " space-y-3"}>
      <h2 className="text-lg font-bold">3. Pilihan Layanan</h2><p className="text-sm text-zinc-600">Pilih layanan sesuai kontrak akun J&T Anda.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{["EZ", "HBO", "JND", "JSD"].map(code => <label key={code} className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 p-4">
        <input type="checkbox" checked={selectedServices.includes(code)} onChange={event => { setSelectedServices(previous => event.target.checked ? [...previous, code] : previous.filter(item => item !== code)); edited(); }} className="accent-red-600" />{code}</label>)}</div>
    </fieldset>
    <fieldset disabled={busy || !stored} className={card + " space-y-3"}>
      <h2 className="text-lg font-bold">4. Uji Koneksi API</h2><p className="text-sm text-zinc-600">Periksa respons HTTP seluruh endpoint tanpa membuat atau membatalkan pesanan.</p>
      <button type="button" onClick={testAll} className="min-h-11 rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Memeriksa…" : "Test API"}</button>
      <div aria-live="polite" className="grid gap-2 text-sm sm:grid-cols-2">{groups.map(group => <p key={group.kind}>{group.label.slice(3)} · {tests[group.kind] || "Belum diuji"}</p>)}</div>
    </fieldset>
    {dirty && <p className="text-sm text-zinc-500">Perubahan diterapkan setelah Simpan Konfigurasi.</p>}
    {notice && <p role="status" className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">{notice}</p>}
    <div className="flex justify-end"><button type="submit" disabled={busy || !stored} className="min-h-11 rounded-lg bg-black px-6 font-semibold text-white disabled:opacity-50">Simpan Konfigurasi</button></div>
  </form>;
}

function WarehouseRegions({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [province, setProvince] = useState(value.slice(0, 2));
  const [city, setCity] = useState(value.slice(0, 5));
  const [lists, setLists] = useState<Record<string, { code: string; name: string }[]>>({});
  const [error, setError] = useState("");
  useEffect(() => { if (value) { setProvince(value.slice(0, 2)); setCity(value.slice(0, 5)); } }, [value]);
  useEffect(() => {
    const controller = new AbortController();
    const requests = [["provinces", ""], ...(province ? [["regencies", province]] : []), ...(city ? [["districts", city]] : [])];
    Promise.all(requests.map(async ([level, parent]) => {
      const data = await shippingRequest<{ data: { code: string; name: string }[] }>("/api/v1/regions?level=" + level + "&parent=" + parent, { signal: controller.signal });
      return [level, data.data] as const;
    })).then(items => { setLists(Object.fromEntries(items)); setError(""); })
      .catch(() => { if (!controller.signal.aborted) setError("Wilayah gagal dimuat. Silakan muat ulang."); });
    return () => controller.abort();
  }, [province, city]);
  return <div className="grid gap-4 sm:grid-cols-3">
    <label className="text-sm">Provinsi<select required className={field} value={province} onChange={event => { setProvince(event.target.value); setCity(""); onChange(""); }}><option value="">Pilih provinsi</option>{lists.provinces?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
    <label className="text-sm">Kota/Kabupaten<select required disabled={!province} className={field} value={city} onChange={event => { setCity(event.target.value); onChange(""); }}><option value="">Pilih kota/kabupaten</option>{lists.regencies?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
    <label className="text-sm">Kecamatan<select required disabled={!city} className={field} value={value} onChange={event => onChange(event.target.value)}><option value="">Pilih kecamatan</option>{lists.districts?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
    {error && <p role="status" className="text-sm">{error}</p>}
  </div>;
}
