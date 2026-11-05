"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { JntDistrictPicker, JntMappingSettings, readMapping, type MappingStatus } from "./jnt-mapping-settings";
import { shippingJson, shippingRequest, type ShippingStatus } from "./shipping-settings";

const integration = "/api/v1/admin/integrations/jnt";
const settings = "/api/v1/admin/shipping/settings";
const emptyEndpoints = { order: "", tariff: "", tracking: "", cancellation: "" };
const emptyWarehouse = { name: "", contact: "", phone: "", address: "", districtCode: "" };
const warehouseFields = [["name", "Nama pengirim", 30], ["contact", "Kontak pengirim", 30],
  ["phone", "Telepon (+62)", 15], ["address", "Alamat detail gudang", 200]] as const;
const groups = [
  { kind: "order", label: "1. Order", fields: [["orderKey", "Key"], ["orderUsername", "Username"], ["orderApiKey", "API Key"]] },
  { kind: "tariff", label: "2. Tariff Check", fields: [["tariffKey", "Key"], ["tariffCustomer", "Customer Name"]] },
  { kind: "tracking", label: "3. Tracking", fields: [["trackingUsername", "Username / e-company ID"], ["trackingPassword", "Password Track"]] },
  { kind: "cancellation", label: "4. Cancellation", fields: [["cancellationKey", "Key"], ["cancellationUsername", "Username"], ["cancellationApiKey", "API Key"]] },
] as const;
type Endpoint = keyof typeof emptyEndpoints;
type Env = "sandbox" | "production";
type Stored = { configured: boolean; endpoints: typeof emptyEndpoints | null; sharedCancellation: boolean; credentialSet: Record<string, boolean>;
  seller: { warehouse: Omit<typeof emptyWarehouse, "districtCode"> & { districtCode?: string }; services: { verificationReference: string; validUntil: string }[] } | null };
const field = "mt-1 block min-h-11 w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm";

export function JntIntegrationSettings() {
  const [environment, setEnvironment] = useState<Env>("sandbox");
  const [mapping, setMapping] = useState<MappingStatus | null>(null);
  return <div className="space-y-5">
    <Link href="/admin/shipping" className="text-sm font-semibold underline">Pengaturan Pengiriman</Link>
    <h1 className="font-display text-2xl font-bold">J&T Express API</h1>
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
  const [serviceReference, setServiceReference] = useState("");
  const [serviceExpiry, setServiceExpiry] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("1000");
  const [awb, setAwb] = useState("");
  const [ownsAwb, setOwnsAwb] = useState(false);
  const [tests, setTests] = useState<Partial<Record<Endpoint, string>>>({});
  const [proof, setProof] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([shippingRequest<Stored>(integration + "?environment=" + environment),
      shippingRequest<ShippingStatus>(settings + "?environment=" + environment), readMapping()])
      .then(([data, status, maps]) => {
        if (!alive) return;
        setStored(data); setShipping(status); setMapping(maps);
        setEndpoints(data.endpoints ?? emptyEndpoints);
        setSharedCancellation(data.configured && data.sharedCancellation);
        if (data.seller) {
          const { name, contact, phone, address, districtCode } = data.seller.warehouse;
          setWarehouse({ name, contact, phone, address, districtCode: districtCode || "" });
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
    return { environment, endpoints, credentials, sharedCancellation, seller: { warehouse,
      services: serviceReference && serviceExpiry ? [{ code: "EZ", verificationReference: serviceReference,
        validUntil: new Date(serviceExpiry + "T23:59:59.000Z").toISOString() }] : [] } };
  }
  async function refresh() {
    setShipping(await shippingRequest<ShippingStatus>(settings + "?environment=" + environment));
  }
  async function mappingChanged() {
    const maps = await readMapping();
    if (maps.activeVersion !== mapping?.activeVersion) { clearTests(); setDestination(""); }
    setMapping(maps);
    await refresh();
  }
  async function test(endpoint: Endpoint) {
    setBusy(true); setNotice("");
    if (endpoint === "tariff") setProof(undefined);
    try {
      const result = await shippingRequest<{ message: string; tariffProof?: string }>(integration + "/test", shippingJson("POST", {
        draft: draft(), endpoint,
        ...(endpoint === "tariff" ? { destinationDistrictCode: destination, weightGram: Number(weight) } : {}),
        ...(endpoint === "tracking" ? { awb: awb.trim().toUpperCase(), ownsAwb } : {}),
      }));
      setTests(previous => ({ ...previous, [endpoint]: result.message }));
      if (result.tariffProof) setProof(result.tariffProof);
    } catch (error) { setTests(previous => ({ ...previous, [endpoint]: "Gagal · " + (error as Error).message })); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      const data = await shippingRequest<Stored>(integration, shippingJson("PUT", { ...draft(), tariffProof: proof }));
      setStored(data); setCredentials({}); setDirty(false); setProof(undefined);
      await refresh(); setNotice("Konfigurasi tersimpan.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function activate() {
    setBusy(true); setNotice("");
    try {
      setShipping(await shippingRequest<ShippingStatus>(settings, shippingJson("PUT", { method: "jnt", environment })));
      setNotice("J&T Express diaktifkan untuk checkout baru.");
    } catch (error) { setNotice((error as Error).message); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} className="space-y-5">
    <label className="block max-w-xs text-sm font-semibold">Environment
      <select className={field} disabled={busy} value={environment} onChange={event => setEnvironment(event.target.value as Env)}>
        <option value="sandbox">Sandbox</option><option value="production">Production</option>
      </select>
    </label>
    <p className="text-sm text-zinc-600">Gunakan URL lengkap dari dashboard resmi J&T. Server memeriksa daftar URL yang disetujui. Kosongkan kredensial bertanda tersimpan untuk mempertahankan nilainya.</p>
    <fieldset disabled={busy || !stored} className="grid gap-4 lg:grid-cols-2">
      {groups.map(group => <section key={group.kind} className="min-w-0 space-y-3 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="font-semibold">{group.label}</h2>
        {group.kind === "cancellation" && <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={sharedCancellation} onChange={event => { setSharedCancellation(event.target.checked); edited(); }} />
          Gunakan kredensial Order jika J&T mengonfirmasi kredensial yang sama.
        </label>}
        {(group.kind !== "cancellation" || !sharedCancellation) && group.fields.map(([key, label]) =>
          <label key={key} className="block text-sm">{label} {stored?.credentialSet[key] && <span className="text-emerald-700">· Tersimpan</span>}
            <input type="password" autoComplete="new-password" className={field} value={credentials[key] || ""}
              maxLength={key.endsWith("Username") || key === "tariffCustomer" ? 120 : key.endsWith("ApiKey") ? 200 : 300}
              onChange={event => { setCredentials(previous => ({ ...previous, [key]: event.target.value })); edited(); }} />
          </label>)}
        <label className="block text-sm">Endpoint URL
          <input type="url" required maxLength={350} value={endpoints[group.kind]} className={field}
            onChange={event => { setEndpoints(previous => ({ ...previous, [group.kind]: event.target.value })); edited(); }} />
        </label>
      </section>)}
    </fieldset>
    <fieldset disabled={busy || !stored}>
      <JntMappingSettings state={mapping} onChange={mappingChanged} />
    </fieldset>
    <fieldset disabled={busy || !stored} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="font-semibold">Alamat Gudang Pengirim</h2>
      <p className="text-sm text-zinc-600">Gunakan referensi persetujuan J&T untuk memastikan layanan EZ yang dipakai toko masih berlaku.</p>
      <JntDistrictPicker key={mapping?.activeVersion} label="Kecamatan gudang" value={warehouse.districtCode}
        onChange={districtCode => { setWarehouse(previous => ({ ...previous, districtCode })); edited(); }}
        version={mapping?.activeVersion} showOrigin />
      <div className="grid gap-3 sm:grid-cols-2">
        {warehouseFields.map(([key, label, max]) => <label key={key} className="text-sm">{label}
          <input required maxLength={max} value={warehouse[key]} className={field} type={key === "phone" ? "tel" : "text"}
            onChange={event => { setWarehouse(previous => ({ ...previous, [key]: event.target.value })); edited(); }} />
        </label>)}
        <label className="text-sm">Referensi persetujuan layanan EZ
          <input value={serviceReference} maxLength={160} className={field}
            onChange={event => { setServiceReference(event.target.value); edited(); }} />
        </label>
        <label className="text-sm">Berlaku sampai (UTC)
          <input type="date" value={serviceExpiry} className={field}
            onChange={event => { setServiceExpiry(event.target.value); edited(); }} />
        </label>
      </div>
    </fieldset>
    <fieldset disabled={busy || !stored} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="font-semibold">Tes draft sebelum simpan</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <JntDistrictPicker key={mapping?.activeVersion} label="Kecamatan tujuan uji" value={destination} version={mapping?.activeVersion}
          onChange={code => { setDestination(code); clearTests(); }} />
        <label className="text-sm">Berat uji (gram)
          <input type="number" min={1} max={100000} value={weight} className={field}
            onChange={event => { setWeight(event.target.value); clearTests(); }} />
        </label>
        <label className="text-sm">Nomor resi untuk uji Tracking
          <input value={awb} maxLength={30} className={field} onChange={event => { setAwb(event.target.value); setOwnsAwb(false); setTests(previous => ({ ...previous, tracking: undefined })); }} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ownsAwb}
          onChange={event => { setOwnsAwb(event.target.checked); setTests(previous => ({ ...previous, tracking: undefined })); }} />
          Saya berwenang menggunakan resi milik toko ini.</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(group => <div key={group.kind}>
          <button type="button" className="min-h-11 rounded-xl bg-zinc-100 px-4 text-sm font-semibold" onClick={() => test(group.kind)}>
            {group.kind === "order" || group.kind === "cancellation" ? "Validasi " : "Uji "}{group.label.slice(3)}
          </button>
          <p role="status" className="mt-1 text-sm">{tests[group.kind] || "Belum diuji"}</p>
        </div>)}
      </div>
    </fieldset>
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="font-semibold">Simpan & Aktivasi</h2>
      <p className="text-sm">Checkout aktif menggunakan {shipping?.activeEnvironment ? "J&T Express · " + shipping.activeEnvironment : "Pengiriman Manual"}.</p>
      {dirty && <p className="text-sm">Checklist di bawah berlaku untuk konfigurasi tersimpan. Simpan perubahan sebelum aktivasi.</p>}
      <ul className="space-y-1 text-sm">{shipping?.checks.map(check =>
        <li key={check.label}>{check.ready ? "✓" : "○"} {check.label}{check.reason ? " · " + check.reason : ""}</li>)}</ul>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !stored} className="min-h-11 rounded-xl bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">Simpan konfigurasi</button>
        <button type="button" disabled={busy || dirty || !shipping?.checks.every(check => check.ready)} onClick={activate}
          className="min-h-11 rounded-xl bg-zinc-100 px-4 text-sm font-semibold disabled:opacity-50">Aktifkan J&T untuk checkout</button>
      </div>
    </section>
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </form>;
}
