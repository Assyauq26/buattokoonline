"use client";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useState, useRef, useEffect } from "react";
import { UnsavedFormGuard } from "@/components/ui/unsaved-form-guard";
import { normalizeWhatsApp, storeChatUrl } from "@/lib/store-contact";
import type { StoreAppearanceV1 } from "@/modules/appearance/schema";
export function StoreInformation({
  initial,
  versions,
}: {
  initial: StoreAppearanceV1["identity"];
  versions: { draftVersion: number; publishedVersion: number };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [baseline, setBaseline] = useState(initial);
  const [version, setVersion] = useState(versions);
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState(""),
    [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const valid = !!normalizeWhatsApp(value.whatsapp),
    url =
      mounted && valid
        ? storeChatUrl(
            value.whatsapp,
            { name: "Contoh Produk", slug: "contoh" },
            1,
          )
        : null;
  async function upload(file: File) {
    if (lock.current) return;
    if (
      file.size > 2097152 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setMessage("Gunakan PNG, JPG atau WebP maksimal 2 MiB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const f = new FormData();
      f.set("image", file);
      f.set("requestId", crypto.randomUUID());
      const r = await fetch("/api/v1/admin/store-branding", {
        method: "POST",
        body: f,
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "Upload gagal");
      setValue((v) => ({ ...v, logoAssetId: j.data.id, mode: "both" }));
      setPreview(URL.createObjectURL(file));
      setMessage("Logo siap. Simpan informasi toko untuk menerbitkan.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/v1/admin/store-information", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: value, ...version }),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "Belum tersimpan");
      setValue(j.data.identity);
      setBaseline(j.data.identity);
      setVersion({
        draftVersion: j.data.draftVersion,
        publishedVersion: j.data.publishedVersion,
      });
      setRevision((n) => n + 1);
      setMessage("Informasi toko tersimpan dan diterbitkan.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Koneksi terputus. Isian tetap tersimpan.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const field = (
    key:
      | "name"
      | "description"
      | "operationalAddress"
      | "whatsapp"
      | "serviceHours",
    label: string,
    max: number,
    area = false,
  ) => (
    <label className="setting-field">
      {label}
      {area ? (
        <textarea
          value={value[key]}
          maxLength={max}
          disabled={busy}
          onChange={(e) => setValue((v) => ({ ...v, [key]: e.target.value }))}
        />
      ) : (
        <input
          value={value[key]}
          maxLength={max}
          required={key === "name"}
          disabled={busy}
          inputMode={key === "whatsapp" ? "tel" : undefined}
          placeholder={key === "whatsapp" ? "+62 81234567890" : undefined}
          onChange={(e) =>
            setValue((v) => ({
              ...v,
              [key]: e.target.value,
              ...(key === "whatsapp" && !normalizeWhatsApp(e.target.value)
                ? { showWhatsApp: false }
                : {}),
            }))
          }
        />
      )}
    </label>
  );
  return (
    <UnsavedFormGuard revision={String(revision)}>
      <form onSubmit={save} className="store-settings-form">
        <header>
          <h1>Informasi Toko</h1>
          <p>Informasi ini dapat dilihat pelanggan.</p>
        </header>
        <section className="settings-card">
          <h2>Identitas toko</h2>
          <div className="identity-grid">
            <div className="logo-editor">
              <label>Logo toko</label>
              {preview || value.logoAssetId ? (
                <img
                  src={
                    preview ||
                    "/api/v1/admin/store-branding/" + value.logoAssetId
                  }
                  alt="Preview logo"
                />
              ) : (
                <span className="store-initials" aria-label="Inisial toko">
                  {value.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((v) => v[0])
                    .join("")
                    .toUpperCase()}
                </span>
              )}
              <label className="setting-outline upload-logo">
                Ganti logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void upload(e.target.files[0]);
                  }}
                />
              </label>
              <small>
                Format JPG, PNG, WebP.
                <br />
                Maks. 2 MiB.
              </small>
            </div>
            <div className="identity-fields">
              {field("name", "Nama toko", 100)}
              {field("description", "Deskripsi toko", 1000, true)}
              {field("operationalAddress", "Alamat operasional", 1000, true)}
              <small>Alamat ini tidak mengubah gudang pengirim J&T.</small>
            </div>
          </div>
        </section>
        <section className="settings-card">
          <h2>Layanan pelanggan</h2>
          <div className="service-grid">
            <div className="identity-fields">
              {field("whatsapp", "WhatsApp toko", 40)}
              <small>
                Nomor ini digunakan tombol Chat Toko pada halaman produk.
              </small>
              {!valid && value.whatsapp && (
                <p role="alert">
                  Gunakan nomor internasional yang valid, misalnya +62
                  81234567890.
                </p>
              )}
              <a
                className="setting-outline test-whatsapp"
                href={url || undefined}
                aria-disabled={!url || busy}
                onClick={(e) => {
                  if (!url || busy) e.preventDefault();
                }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon size={18} /> Tes WhatsApp
              </a>
              <label className="setting-switch">
                <span>
                  <strong>Tampilkan Chat WhatsApp</strong>
                  <small>Pelanggan diarahkan langsung ke WhatsApp toko.</small>
                </span>
                <input
                  role="switch"
                  type="checkbox"
                  checked={value.showWhatsApp}
                  disabled={!valid || busy}
                  onChange={(e) =>
                    setValue((v) => ({ ...v, showWhatsApp: e.target.checked }))
                  }
                />
              </label>
              {field("serviceHours", "Jam layanan", 200)}
            </div>
            <aside className="chat-preview">
              <strong>Pratinjau Chat Toko</strong>
              <p>
                {url
                  ? new URL(url).searchParams.get("text")
                  : "Isi nomor valid untuk melihat pratinjau."}
              </p>
              <hr />
              <small>Nomor tujuan</small>
              <b>
                {valid
                  ? "+" + normalizeWhatsApp(value.whatsapp)
                  : "Belum tersedia"}
              </b>
              <small>
                Tes memakai nilai form saat ini, termasuk perubahan yang belum
                disimpan. Membuka WhatsApp tidak mengirim pesan.
              </small>
            </aside>
          </div>
        </section>
        <aside className="settings-private">
          <strong>Data pribadi seller dikelola terpisah.</strong>
          <p>
            Ubah data pribadi di menu Informasi Seller. Nama toko digunakan pada
            email customer; jam layanan bukan status online.
          </p>
        </aside>
        <p role="status" aria-live="polite">
          {message}
        </p>
        <footer className="settings-save">
          <span>
            {JSON.stringify(value) !== JSON.stringify(baseline)
              ? "Ada perubahan yang belum disimpan"
              : "Informasi toko"}
          </span>
          <button
            type="button"
            className="setting-outline"
            disabled={busy}
            onClick={() => {
              setValue(baseline);
              setPreview("");
              setMessage("Perubahan dibatalkan.");
              setRevision((n) => n + 1);
            }}
          >
            Batalkan
          </button>
          <button disabled={busy} className="setting-primary">
            {busy ? "Menyimpan…" : "Simpan perubahan"}
          </button>
        </footer>
      </form>
    </UnsavedFormGuard>
  );
}
