"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Printer } from "lucide-react";
import {
  shippingJson,
  shippingRequest,
  type ShippingStatus,
} from "./shipping-settings";
import { SaveLabel, SettingsFeedback } from "./settings-feedback";
export function ShippingOverview({
  initial,
  environments,
  canManage,
}: {
  initial: { manualFlat: number | null; activeEnvironment: string | null };
  environments: { environment: string; configured: boolean; address: string }[];
  canManage: boolean;
}) {
  const router = useRouter(),
    lock = useRef(false);
  const [active, setActive] = useState(initial.activeEnvironment);
  const [method, setMethod] = useState(
    initial.activeEnvironment ? "jnt" : "manual",
  );
  const [environment, setEnvironment] = useState(
    initial.activeEnvironment ||
      environments.find((e) => e.configured)?.environment ||
      "production",
  );
  const [cost, setCost] = useState(String(initial.manualFlat ?? ""));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const selected = environments.find((e) => e.environment === environment);
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        if (
          method === "manual" &&
          (!/^\d+$/.test(cost) || Number(cost) > 100000000)
        ) {
          setMessage("Isi tarif bulat antara 0 dan Rp100.000.000.");
          return;
        }
        lock.current = true;
        setBusy(true);
        setMessage("");
        try {
          const saved = await shippingRequest<ShippingStatus>(
            "/api/v1/admin/shipping/settings",
            shippingJson(
              "PUT",
              method === "manual"
                ? { method, cost: Number(cost) }
                : { method, environment },
            ),
          );
          setActive(saved.activeEnvironment);
          setMessage(
            method === "manual"
              ? "Pengiriman Manual aktif. Tarif tersimpan."
              : "J&T Express aktif untuk checkout.",
          );
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <header>
        <h1>Pengiriman</h1>
        <p>Pilih satu metode pengiriman aktif untuk checkout.</p>
      </header>
      <p className="text-sm">
        Metode aktif:{" "}
        <strong>
          {active
            ? "J&T Express · " + active
            : initial.manualFlat !== null
              ? "Pengiriman Manual"
              : "Belum dikonfigurasi"}
        </strong>
      </p>
      <fieldset disabled={busy || !canManage} className="settings-methods">
        <legend className="sr-only">Metode pengiriman</legend>
        {[
          ["manual", "Pengiriman Manual", "Tarif tetap per pesanan."],
          ["jnt", "API J&T Express", "Integrasi pengiriman J&T Express."],
        ].map(([id, title, description]) => (
          <label key={id} className="settings-method">
            <input
              type="radio"
              name="method"
              value={id}
              checked={method === id}
              onChange={() => setMethod(id)}
            />
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {method === "manual" ? (
        <section className="settings-card identity-fields">
          <label className="setting-field">
            Tarif per pesanan (Rp)
            <input
              disabled={busy || !canManage}
              inputMode="numeric"
              required
              pattern="[0-9]+"
              maxLength={9}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <small>
            Masukkan 0 untuk gratis ongkir. Tarif dikenakan sekali per pesanan.
          </small>
        </section>
      ) : (
        <section className="settings-card identity-fields">
          <label className="setting-field">
            Environment
            <select
              aria-label="Environment"
              disabled={busy || !canManage}
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="production">Production</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </label>
          <p className="text-sm">
            {selected?.configured
              ? "Konfigurasi tersedia. Kesiapan layanan dan mapping diperiksa saat aktivasi."
              : "Konfigurasi belum tersedia."}
          </p>
          {canManage && (
            <Link
              className="setting-outline"
              href={"/admin/settings/shipping/jnt?environment=" + environment}
            >
              Kelola konfigurasi
            </Link>
          )}
        </section>
      )}
      <section className="settings-card">
        {canManage && (
          <Link
            className="settings-detail-link"
            href={
              "/admin/settings/shipping/jnt?environment=" +
              environment +
              "#warehouse"
            }
          >
            <MapPin size={21} />
            <span>
              <strong>Alamat pengirim</strong>
              <small>
                {selected?.address ||
                  "Atur gudang pengirim di konfigurasi J&T."}
              </small>
            </span>
            <b>Ubah ›</b>
          </Link>
        )}
        <Link
          className="settings-detail-link"
          href="/admin/settings/shipping/print"
        >
          <Printer size={21} />
          <span>
            <strong>Preferensi cetak AWB</strong>
            <small>75 × 150 mm atau 100 × 150 mm · Vertikal</small>
          </span>
          <b>Ubah ›</b>
        </Link>
      </section>
      <Link
        className="text-sm underline"
        href="/admin/settings/shipping/coverage"
      >
        Periksa kesiapan tarif dan mapping J&T Express
      </Link>
      <SettingsFeedback message={message} />
      {canManage ? (
        <footer className="settings-save">
          <span>Perubahan diterapkan setelah disimpan.</span>
          <button disabled={busy} className="setting-primary">
            <SaveLabel busy={busy}>Simpan perubahan</SaveLabel>
          </button>
        </footer>
      ) : (
        <p className="text-sm">
          Perubahan pengiriman memerlukan administrator integrasi.
        </p>
      )}
    </form>
  );
}
