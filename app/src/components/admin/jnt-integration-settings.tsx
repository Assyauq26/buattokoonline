"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldAlert } from "lucide-react";

type Env = "sandbox" | "production";
type Endpoint = "order" | "tariff" | "tracking" | "cancellation";
type Secret = "orderUsername" | "orderApiKey" | "orderKey" | "tariffCustomer" | "tariffKey" |
  "trackingUsername" | "trackingPassword";
type Endpoints = Record<Endpoint, string>;
type Secrets = Record<Secret, string>;
type Seller = { warehouse: { name: string; contact: string; phone: string; address: string; originSite: string; originCityCode: string };
  services: Array<{ code: "EZ"; verificationReference: string; validUntil: string }> };
const emptyWarehouse: Seller["warehouse"] = { name: "", contact: "", phone: "", address: "", originSite: "", originCityCode: "" };
type Status = {
  configured: boolean;
  enabled: boolean;
  updatedAt: string | null;
  endpoints: Endpoints | null;
  credentialSet: Record<Secret, boolean>;
  seller?: Seller | null;
};
const emptySecrets: Secrets = {
  orderUsername: "", orderApiKey: "", orderKey: "", tariffCustomer: "",
  tariffKey: "", trackingUsername: "", trackingPassword: "",
};
const paths = {
  order: "/jts-idn-ecommerce-api/api/order/create",
  cancellation: "/jts-idn-ecommerce-api/api/order/cancel",
  tariff: "/jandt_track/inquiry.action",
  tracking: "/jandt_track/track/trackAction!tracking.action",
};
function defaults(env: Env): Endpoints {
  const orderHost = env === "sandbox" ? "demo-ecommerce.inuat-jntexpress.id" : "api.jet.co.id";
  const trackHost = env === "sandbox" ? "demo-general.inuat-jntexpress.id" : "partner-track.jet.co.id";
  return {
    order: "https://" + orderHost + paths.order,
    cancellation: "https://" + orderHost + paths.cancellation,
    tariff: "https://" + trackHost + paths.tariff,
    tracking: "https://" + trackHost + paths.tracking,
  };
}
const groups: Array<{ name: string; endpoint: Endpoint; description: string; fields: Array<{ key: Secret; label: string; sensitive?: boolean }> }> = [
  { name: "1. Order (Create AWB)", endpoint: "order",
    description: "Buat resi dari order yang sudah terverifikasi. Tidak tersedia tombol uji pembuatan resi agar tidak terjadi order ganda.",
    fields: [{ key: "orderUsername", label: "Username Order" }, { key: "orderApiKey", label: "API Key Order", sensitive: true }, { key: "orderKey", label: "Signing Key Order", sensitive: true }] },
  { name: "2. Tariff Check (Ongkir)", endpoint: "tariff",
    description: "POST data dan sign. Tarif diambil berdasarkan kota asal, kecamatan tujuan dari mapping L3, berat aktual, dan layanan.",
    fields: [{ key: "tariffCustomer", label: "Customer Name / cusName" }, { key: "tariffKey", label: "Signing Key Tariff", sensitive: true }] },
  { name: "3. Tracking", endpoint: "tracking",
    description: "Basic Authentication dan body JSON berisi awb serta eccompanyid.",
    fields: [{ key: "trackingUsername", label: "Basic Auth Username / e-company ID" }, { key: "trackingPassword", label: "Basic Auth Password", sensitive: true }] },
  { name: "4. Cancellation", endpoint: "cancellation",
    description: "POST data_param dan data_sign. Menggunakan kredensial Order yang sama; pembatalan hanya boleh dijalankan dari pesanan milik toko yang masih memenuhi syarat.",
    fields: [] },
];
export function JntIntegrationSettings({ localStore = true }: { localStore?: boolean }) {
  const [warehouse, setWarehouse] = useState({ ...emptyWarehouse });
  const [serviceReference, setServiceReference] = useState("");
  const [serviceExpiry, setServiceExpiry] = useState("");
  const [district, setDistrict] = useState("");
  const [weight, setWeight] = useState("1000");
  const [testing, setTesting] = useState(false);
  const [probeStatus, setProbeStatus] = useState<Partial<Record<Endpoint, string>>>({});
  const [environment, setEnvironment] = useState<Env>("sandbox");
  const [endpoints, setEndpoints] = useState<Endpoints>(defaults("sandbox"));
  const [secrets, setSecrets] = useState<Secrets>({ ...emptySecrets });
  const [status, setStatus] = useState<Status | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotice("");
    setStatus(null);
    setEnabled(false);
    setSecrets({ ...emptySecrets });
    setEndpoints(defaults(environment));
    setWarehouse({ ...emptyWarehouse }); setServiceReference(""); setServiceExpiry("");
    setDistrict("");
    setProbeStatus({});
    fetch("/api/v1/admin/integrations/jnt?environment=" + environment, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error?.message || "Gagal membaca konfigurasi");
        return json.data as Status;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setStatus(data);
        setEnabled(data.enabled);
        setEndpoints(data.endpoints || defaults(environment));
        if (data.seller) {
          setWarehouse(data.seller.warehouse);
          setServiceReference(data.seller.services[0]?.verificationReference || "");
          setServiceExpiry(data.seller.services[0]?.validUntil.slice(0, 10) || "");
        }
      })
      .catch(error => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Gagal membaca konfigurasi"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [environment]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/integrations/jnt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ environment, endpoints, credentials: secrets, enabled,
          ...(localStore ? { seller: { warehouse, services: serviceReference && serviceExpiry ? [{ code: "EZ", verificationReference: serviceReference,
            validUntil: new Date(serviceExpiry + "T23:59:59.000Z").toISOString() }] : [] } } : {}) }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error?.message || "Gagal menyimpan");
      setSecrets({ ...emptySecrets });
      setProbeStatus({});
      setStatus(previous => ({
        configured: true,
        enabled: json.data.enabled,
        updatedAt: json.data.updatedAt,
        endpoints,
        credentialSet: Object.fromEntries(Object.keys(emptySecrets).map(key => [key, true])) as Record<Secret, boolean>,
      }));
      setNotice("Pengaturan tersimpan. Checkout tetap menunggu verifikasi wilayah, berat produk, tarif, dan layanan.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan konfigurasi");
    } finally { setSaving(false); }
  }
  async function testEndpoint(endpoint: Endpoint) {
    if (testing || loading || saving) return;
    setTesting(true); setNotice("");
    try {
      const response = await fetch("/api/v1/admin/integrations/jnt/test", { method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ environment, endpoint,
          ...(endpoint === "tariff" ? { destinationDistrictCode: district, weightGram: Number(weight) } : {}) }) });
      const data = await response.json();
      setProbeStatus(previous => ({ ...previous, [endpoint]: response.ok && data.success ? data.data.status : "FAILED" }));
      setNotice(response.ok && data.success ? data.data.message : data.error?.message || "Uji gagal");
    } catch { setNotice("Uji tidak dapat diselesaikan. Tidak ada status koneksi yang dikonfirmasi."); }
    finally { setTesting(false); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">J&T Express</h1>
        <p className="mt-1 text-sm text-zinc-500">{localStore ? "Konfigurasi pengiriman milik toko ini. Kredensial disimpan hanya di server toko." : "Konfigurasi pengiriman toko ini."}</p>
      </div>
      <div className="rounded-full bg-zinc-100 p-1" role="group" aria-label="Lingkungan J&T">
        {(["sandbox", "production"] as const).map(env => <button key={env} type="button"
          aria-pressed={environment === env} disabled={saving || testing} onClick={() => setEnvironment(env)}
          className={"rounded-full px-4 py-2 text-sm font-medium min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " + (environment === env ? "bg-black text-white" : "text-zinc-600")}>
          {env === "sandbox" ? "Sandbox" : "Production"}
        </button>)}
      </div>
    </div>
    <div className="flex gap-3 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
      <ShieldAlert className="shrink-0" size={20}/>
      <span>Kredensial tidak akan ditampilkan kembali setelah disimpan. Kosongkan input secret untuk mempertahankan nilai lama. Jangan masukkan kredensial Demo ke environment Production. Pengubahan ini tidak otomatis membuat resi atau membuka checkout.</span>
    </div>
    <form onSubmit={save} className="space-y-5">

      {groups.map(group => {
        const content = <>

        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">{localStore ? ({ order: "Akun J&T Express", tariff: "Kredensial Check Fee", tracking: "Kredensial pelacakan", cancellation: "Pembatalan resi" })[group.endpoint] : group.name}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">{localStore ? ({ order: "Gunakan username, API Key, dan Signing Key dari akun J&T toko Anda.", tariff: "Isi kredensial Check Fee yang ditetapkan untuk akun Anda. Kunci ini dapat berbeda dari kredensial Order.", tracking: "Isi akun pelacakan hanya sesuai kontrak J&T. Kredensial Order tidak otomatis berlaku di sini.", cancellation: "Pembatalan memakai kredensial Order. Tidak ada resi yang dibuat atau dibatalkan dari halaman ini." })[group.endpoint] : group.description}</p></div>
          <LockKeyhole size={19} className="shrink-0 text-zinc-400"/>
        </div>
        {localStore && group.endpoint === "order" ? <details className="text-sm text-zinc-600">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">Verifikasi Order</summary>
          <div className="space-y-3 pt-3">        {localStore && <button type="button" disabled={loading || saving || testing || !status?.configured} onClick={() => testEndpoint(group.endpoint)}
          className="min-h-11 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold disabled:opacity-50">{testing ? "Memeriksa..." : "Periksa verifikasi Order"}</button>}
        {localStore && <p className="text-sm text-zinc-600">Hasil uji: {({ CONNECTED: "Check Fee berhasil; checkout masih menunggu verifikasi lengkap", SAFE_PROBE_UNAVAILABLE: "Memerlukan verifikasi; uji aman belum tersedia", FAILED: "Belum berhasil dikonfirmasi" } as Record<string, string>)[probeStatus[group.endpoint] || ""] || "Belum diuji"}</p>}
</div>
        </details> : <>        {localStore && <button type="button" disabled={loading || saving || testing || !status?.configured} onClick={() => testEndpoint(group.endpoint)}
          className="min-h-11 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold disabled:opacity-50">{testing ? "Memeriksa..." : (group.endpoint === "tariff" ? "Uji koneksi Check Fee" : "Periksa verifikasi " + ({ order: "Order", tracking: "Tracking", cancellation: "Cancel" } as Record<string, string>)[group.endpoint])}</button>}
        {localStore && <p className="text-sm text-zinc-600">Hasil uji: {({ CONNECTED: "Check Fee berhasil; checkout masih menunggu verifikasi lengkap", SAFE_PROBE_UNAVAILABLE: "Memerlukan verifikasi; uji aman belum tersedia", FAILED: "Belum berhasil dikonfirmasi" } as Record<string, string>)[probeStatus[group.endpoint] || ""] || "Belum diuji"}</p>}
</>}
        {localStore ? <details className="text-sm text-zinc-600">
          <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Pengaturan teknis endpoint</summary>
        <label className="block text-xs font-semibold text-zinc-600">
          Endpoint URL
          <input type="url" required maxLength={350} disabled={loading || saving || testing}
            value={endpoints[group.endpoint]} onChange={event => setEndpoints(old => ({ ...old, [group.endpoint]: event.target.value }))}
            className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3 text-sm font-normal text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600"/>
        </label>
        </details> : <>        <label className="block text-xs font-semibold text-zinc-600">
          Endpoint URL
          <input type="url" required maxLength={350} disabled={loading || saving || testing}
            value={endpoints[group.endpoint]} onChange={event => setEndpoints(old => ({ ...old, [group.endpoint]: event.target.value }))}
            className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3 text-sm font-normal text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600"/>
        </label>
</>}
        {group.fields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
          {group.fields.map(field => <label key={field.key} className="block text-xs font-semibold text-zinc-600">
            {field.label} {status?.credentialSet[field.key] && <span className="ml-1 font-normal text-emerald-700">Tersimpan</span>}
            <input data-jnt-secret={field.key} type={field.sensitive ? "password" : "text"} autoComplete="off" maxLength={300}
              disabled={loading || saving || testing} value={secrets[field.key]}
              onChange={event => setSecrets(old => ({ ...old, [field.key]: event.target.value }))}
              placeholder={status?.credentialSet[field.key] ? "Kosongkan untuk tetap memakai nilai tersimpan" : "Wajib untuk konfigurasi pertama"}
              className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3 text-sm font-normal text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-600"/>
          </label>)}
        </div>}
        </>;
        return <section key={group.endpoint} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          {localStore && group.endpoint !== "order" ? <details open={!!status && !status.configured}>
            <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{({ tariff: "Kredensial tambahan untuk Check Fee", tracking: "Kredensial tambahan untuk pelacakan", cancellation: "Verifikasi pembatalan resi" })[group.endpoint]}</summary>
            <div className="space-y-4 pt-3">{content}</div>
          </details> : content}
        </section>;
      })}
      {localStore && <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Gudang pengirim & layanan</h2>
        <p className="text-sm text-zinc-600">Gunakan kode dan layanan dari perjanjian J&T toko Anda. Referensi yang disimpan merupakan pernyataan admin, bukan verifikasi otomatis. Aktivasi memerlukan konfigurasi server, tarif, wilayah, dan layanan milik toko.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(emptyWarehouse) as Array<keyof typeof emptyWarehouse>).map(key => <label key={key} className="block text-sm">
            {({ name: "Nama pengirim", contact: "Kontak gudang", phone: "Telepon (+62)", address: "Alamat gudang", originSite: "Nama kota asal resmi (Tariff)", originCityCode: "Kode kota asal resmi (Order)" })[key]}
            <input required disabled={loading || saving} type={key === "phone" ? "tel" : "text"} maxLength={key === "address" ? 200 : key === "originSite" ? 80 : key === "originCityCode" ? 3 : key === "phone" ? 15 : 30}
              value={warehouse[key]} onChange={event => setWarehouse(previous => ({ ...previous, [key]: event.target.value }))}
              className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3 outline-none focus:ring-2 focus:ring-zinc-600" />
          </label>)}
          <label className="block text-sm">Referensi persetujuan layanan EZ
            <input disabled={loading || saving} required={!!serviceExpiry} minLength={4} maxLength={160} value={serviceReference} onChange={event => setServiceReference(event.target.value)} className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3" />
          </label>
          <label className="block text-sm">Berlaku sampai (UTC)
            <input type="date" disabled={loading || saving} required={!!serviceReference} value={serviceExpiry} onChange={event => setServiceExpiry(event.target.value)} className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3" />
          </label>
        </div>
        <p className="text-sm">Hasil uji hanya berlaku pada sesi ini. Uji memakai konfigurasi tersimpan, bukan perubahan yang belum disimpan.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Kode kecamatan administratif tujuan uji tarif
            <input value={district} onChange={event => setDistrict(event.target.value)} maxLength={8} className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3" />
          </label>
          <label className="block text-sm">Berat uji (gram)
            <input type="number" min={1} max={100000} value={weight} onChange={event => setWeight(event.target.value)} className="placeholder:text-zinc-500 mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3" />
          </label>
        </div>
      </section>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {status?.configured ? <CheckCircle2 className="text-emerald-600" size={21}/> : <KeyRound size={21}/>}
          <div>
            <div className="text-sm font-semibold">{loading ? "Memeriksa konfigurasi..." : probeStatus.tariff === "CONNECTED" ? "Check Fee berhasil" : probeStatus.tariff === "FAILED" ? "Memerlukan verifikasi" : status?.configured ? "Konfigurasi tersimpan" : "Belum dikonfigurasi"}</div>
            <div className="text-xs text-zinc-500">{status?.updatedAt ? "Diperbarui " + new Date(status.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "Belum ada perubahan tersimpan"}</div>
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={loading} className="size-4 accent-black"/>
          Izinkan penggunaan kredensial tersimpan {environment === "sandbox" ? "Testing" : "Production"}
        </label>
        {localStore && <button type="button" disabled={loading || saving || testing || !status?.configured} onClick={() => testEndpoint("tariff")} className="min-h-11 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{testing ? "Memeriksa..." : "Uji Koneksi"}</button>}
      </div>
      {notice && <p role="status" className="rounded-xl bg-zinc-100 px-4 py-3 text-sm">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-lg text-xs text-zinc-500">{localStore ? "Akses hanya untuk Admin toko dengan izin pengiriman. Kosongkan secret untuk mempertahankan; isi nilai baru untuk rotasi. Semua penyimpanan dicatat pada Audit Log." : "Akses terbatas ke administrator toko. Semua perubahan dicatat pada Audit Log."}</span>
        <button type="submit" disabled={loading || saving || testing} className="min-h-11 rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Menyimpan..." : localStore ? "Simpan Pengaturan" : "Simpan konfigurasi"}
        </button>
      </div>
    </form>
  </div>;
}
