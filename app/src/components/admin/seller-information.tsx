"use client";
import { useState, useRef } from "react";
import { saveSellerName } from "@/modules/admin/seller-profile.actions";
import { useRouter } from "next/navigation";
import { UnsavedFormGuard } from "@/components/ui/unsaved-form-guard";
import { SaveLabel, SettingsFeedback } from "./settings-feedback";
export function SellerInformation({
  profile,
}: {
  profile: {
    name: string;
    email: string;
    phone: string | null;
    updatedAt: string;
  };
}) {
  const [value, setValue] = useState({
    name: profile.name,
    phone: profile.phone || "",
  });
  const [baseline, setBaseline] = useState(value);
  const [revision, setRevision] = useState(profile.updatedAt);
  const [guardRevision, setGuardRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const lock = useRef(false),
    router = useRouter();
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  return (
    <UnsavedFormGuard revision={String(guardRevision)}>
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          const compact = value.phone.trim().replace(/[\s().-]/g, "");
          const normalized = compact.startsWith("0")
            ? "+62" + compact.slice(1)
            : compact.startsWith("62")
              ? "+" + compact
              : compact;
          if (compact && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
            setPhoneError("Gunakan Nomor HP valid, misalnya 081234567890.");
            return;
          }
          setPhoneError("");
          lock.current = true;
          setBusy(true);
          setMessage("");
          try {
            const result = await saveSellerName({ ...value, revision });
            setMessage(
              result.ok
                ? result.data!.message
                : result.error || "Gagal menyimpan.",
            );
            if (result.ok && result.data) {
              const saved = {
                name: result.data.name,
                phone: result.data.phone,
              };
              setValue(saved);
              setBaseline(saved);
              setRevision(result.data.revision);
              setGuardRevision((n) => n + 1);
              router.refresh();
            }
          } catch {
            setMessage(
              "Koneksi terputus. Isian tetap tersedia, silakan coba lagi.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <header>
          <h1>Informasi Seller</h1>
          <p>Data pribadi pengelola toko.</p>
        </header>
        <fieldset disabled={busy} className="settings-card identity-fields">
          <legend className="sr-only">Profil seller</legend>
          <label className="setting-field">
            Nama penanggung jawab
            <input
              value={value.name}
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              onChange={(e) =>
                setValue((v) => ({ ...v, name: e.target.value }))
              }
            />
          </label>
          <label className="setting-field">
            Email akun
            <input
              value={profile.email}
              readOnly
              type="email"
              autoComplete="email"
            />
          </label>
          <label className="setting-field">
            Nomor HP
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              value={value.phone}
              aria-invalid={!!phoneError}
              aria-describedby="seller-phone-help seller-phone-error"
              onChange={(e) => {
                setValue((v) => ({ ...v, phone: e.target.value }));
                setPhoneError("");
              }}
            />
          </label>
          {phoneError && (
            <span
              id="seller-phone-error"
              role="alert"
              className="text-sm text-red-700"
            >
              {phoneError}
            </span>
          )}
          <p id="seller-phone-help" className="text-sm text-zinc-600">
            Nomor kontak pribadi, tidak ditampilkan di toko. Perubahan ini tidak
            mengubah nomor login atau memverifikasi nomor HP.
          </p>
        </fieldset>
        <SettingsFeedback message={message} />
        <footer className="settings-save">
          <span>
            {dirty ? "Ada perubahan yang belum disimpan" : "Profil seller"}
          </span>
          <button
            type="button"
            className="setting-outline"
            disabled={busy || !dirty}
            onClick={() => {
              setValue(baseline);
              setMessage("");
              setPhoneError("");
              setGuardRevision((n) => n + 1);
            }}
          >
            Batalkan
          </button>
          <button disabled={busy || !dirty} className="setting-primary">
            <SaveLabel busy={busy}>Simpan profil</SaveLabel>
          </button>
        </footer>
      </form>
    </UnsavedFormGuard>
  );
}
