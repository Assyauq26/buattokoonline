"use client";
import { ConfirmActions } from "@/components/ui/action-dialog";
import { UnsavedFormGuard } from "@/components/ui/unsaved-form-guard";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { RegionSelectorDialog } from "./region-selector-dialog";
import type { SelectedLocation } from "@/modules/regions/region.validation";
import {
  saveProfileAction,
  passwordAction,
  deleteAccountAction,
  customerStatusAction,
  customerRecoveryAction,
  addressSaveAction,
  addressChangeAction,
} from "@/modules/customers/account.actions";

export type CustomerProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  updatedAt: string;
};
type Address = {
  id: string;
  recipientName: string;
  phone: string;
  line: string;
  isDefault: boolean;
  province: string;
  city: string;
  district: string | null;
  village: string | null;
  provinceCode: string | null;
  cityCode: string | null;
  districtCode: string | null;
  villageCode: string | null;
  postalCode: string;
  regionSource: string | null;
  regionUpdatedAt: string | null;
};
type Result = {
  ok: boolean;
  error?: string;
  data?: { message: string; signOut?: boolean };
};
const section =
  "space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6";
export function AccountSettings({
  profile,
  addresses = [],
  jnt = false,
  operator = false,
  canUpdate = true,
  canDelete = true,
  view = "profile",
}: {
  profile: CustomerProfile;
  addresses?: Address[];
  jnt?: boolean;
  operator?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  view?: string;
}) {
  const selected = ["profile", "addresses", "security", "delete"].includes(view)
    ? view
    : "profile";
  const [transitionPending, start] = useTransition(),
    [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false),
    [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const pending = transitionPending || saving;
  const [signedOut, setSignedOut] = useState(false);
  const router = useRouter();
  async function run(action: () => Promise<Result>) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setFailed(false);
    setMessage("");
    try {
      const result = await action();
      setFailed(!result.ok);
      setMessage(
        result.ok
          ? result.data?.message || "Tersimpan."
          : result.error || "Tidak dapat menyimpan.",
      );
      if (result.ok && result.data?.signOut) setSignedOut(true);
      else if (result.ok) start(() => router.refresh());
    } catch {
      setFailed(true);
      setMessage("Koneksi terputus. Perubahan belum disimpan. Coba lagi.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  if (signedOut)
    return (
      <section className={section}>
        <p role="status">{message}</p>
        <a
          href="/login"
          className="inline-flex rounded-xl bg-black px-5 py-3 text-white"
        >
          Kembali ke Login
        </a>
      </section>
    );
  return (
    <UnsavedFormGuard revision={profile.updatedAt}>
      <ConfirmActions busy={pending} error={failed ? message : undefined}>
        <div
          className="account-settings space-y-5"
          data-section={operator ? "all" : selected}
        >
          {message && (
            <p role="status" className="rounded-xl border p-4 text-sm">
              {message}
            </p>
          )}

          {(operator || selected === "profile") && (
            <form
              id="profile"
              key={profile.updatedAt}
              className={section}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  saveProfileAction(
                    profile.updatedAt,
                    { name: data.get("name"), phone: data.get("phone") },
                    operator ? profile.id : undefined,
                  ),
                );
              }}
            >
              <h2 className="text-lg font-bold">
                {operator ? "Profil Pelanggan" : "Profil Saya"}
              </h2>
              <div>
                <Label htmlFor="profile-name">Nama</Label>
                <Input
                  id="profile-name"
                  name="name"
                  defaultValue={profile.name}
                  required
                  minLength={2}
                  maxLength={120}
                  disabled={!canUpdate || pending}
                />
              </div>
              <div>
                <Label htmlFor="profile-phone">Nomor telepon</Label>
                <Input
                  id="profile-phone"
                  name="phone"
                  defaultValue={profile.phone || ""}
                  required
                  inputMode="tel"
                  maxLength={40}
                  disabled={!canUpdate || pending}
                />
              </div>
              <div>
                <Label htmlFor="profile-email">Email terdaftar</Label>
                <Input id="profile-email" value={profile.email} readOnly />
              </div>
              <p className="text-xs text-zinc-500">
                Email login tetap menggunakan alamat yang sudah diverifikasi.
              </p>
              {canUpdate && (
                <Button disabled={pending} type="submit">
                  Simpan Profil
                </Button>
              )}
            </form>
          )}
          {operator && canUpdate && (
            <section className={section}>
              <h2 className="text-lg font-bold">Status & Pemulihan</h2>
              <p>Akun {profile.isActive ? "aktif" : "nonaktif"}.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  variant="outline"
                  data-confirm-title="Ubah status akun?"
                  onClick={() => {
                    run(() =>
                      customerStatusAction(
                        profile.id,
                        profile.updatedAt,
                        !profile.isActive,
                      ),
                    );
                  }}
                >
                  {profile.isActive ? "Nonaktifkan" : "Aktifkan"}
                </Button>
                <Button
                  disabled={pending || !profile.isActive}
                  variant="outline"
                  data-confirm-title="Kirim pemulihan akun?"
                  onClick={() => {
                    run(() => customerRecoveryAction(profile.id));
                  }}
                >
                  Kirim Email Reset Password
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                Pelanggan menentukan password baru melalui tautan verifikasi.
                Seller tidak dapat melihat atau menetapkan password pelanggan.
              </p>
            </section>
          )}
          {!operator && (
            <>
              {selected === "addresses" && (
                <AddressManager addresses={addresses} jnt={jnt} />
              )}
              {selected === "security" && (
                <form
                  id="security"
                  className={section}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const value = Object.fromEntries(new FormData(form));
                    run(async () => {
                      const result = await passwordAction(value);
                      if (result.ok) form.reset();
                      return result;
                    });
                  }}
                >
                  <h2 className="text-lg font-bold">Keamanan Akun</h2>
                  <p className="text-sm text-zinc-500">
                    Setelah password berubah, semua perangkat perlu login
                    kembali.
                  </p>
                  {(
                    [
                      ["currentPassword", "Password saat ini"],
                      ["password", "Password baru"],
                      ["confirmPassword", "Konfirmasi password baru"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <Label htmlFor={key}>{label}</Label>
                      <Input
                        id={key}
                        name={key}
                        type="password"
                        required
                        maxLength={256}
                        minLength={key === "currentPassword" ? 1 : 6}
                        autoComplete={
                          key === "currentPassword"
                            ? "current-password"
                            : "new-password"
                        }
                        disabled={pending}
                      />
                    </div>
                  ))}
                  <Button disabled={pending} type="submit">
                    Ubah Password
                  </Button>
                </form>
              )}
            </>
          )}
          {canDelete && (operator || selected === "delete") && (
            <form
              data-confirm-title="Hapus akun permanen?"
              data-confirm-label="Hapus Akun"
              data-confirm-description="Selesaikan seluruh kewajiban pesanan dan refund. Penghapusan profil tidak menghapus rincian transaksi lama."
              id="delete-account"
              className={section}
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                run(async () => {
                  const result = await deleteAccountAction(
                    data.get("confirmed") === "on",
                    String(data.get("password") || ""),
                    operator ? profile.id : undefined,
                  );
                  if (result.ok) form.reset();
                  return result;
                });
              }}
            >
              <h2 className="text-lg font-bold">Hapus Akun</h2>
              <p className="text-sm text-zinc-500">
                Selesaikan semua pesanan dan refund terlebih dahulu. Profil dan
                alamat tersimpan dihapus, seluruh sesi dicabut. Rincian
                transaksi lama tetap disimpan untuk kebutuhan operasional dan
                finansial.
              </p>
              {!operator && (
                <div>
                  <Label htmlFor="delete-password">Password saat ini</Label>
                  <Input
                    id="delete-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    disabled={pending}
                  />
                </div>
              )}
              <label className="flex items-start gap-3 text-sm">
                <input
                  name="confirmed"
                  type="checkbox"
                  required
                  disabled={pending}
                  className="mt-1"
                />
                Saya memahami penghapusan akun tidak dapat dibatalkan.
              </label>
              <Button disabled={pending} variant="outline" type="submit">
                Hapus Akun Permanen
              </Button>
            </form>
          )}
        </div>
      </ConfirmActions>
    </UnsavedFormGuard>
  );
}

function AddressManager({
  addresses,
  jnt,
}: {
  addresses: Address[];
  jnt: boolean;
}) {
  const [editing, setEditing] = useState<Address | null>(null),
    [location, setLocation] = useState<SelectedLocation | null>(null);
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  function complete(result: Result) {
    setFailed(!result.ok);
    setMessage(
      result.ok
        ? result.data?.message || "Tersimpan."
        : result.error || "Gagal.",
    );
    if (result.ok) {
      setEditing(null);
      setLocation(null);
      router.refresh();
    }
  }
  async function perform(
    action: () => Promise<Result>,
    onSuccess?: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const result = await action();
      complete(result);
      if (result.ok) onSuccess?.();
    } catch {
      setFailed(true);
      setMessage("Koneksi terputus. Perubahan belum disimpan. Coba lagi.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <ConfirmActions busy={pending} error={failed ? message : undefined}>
      <section id="addresses" className={section}>
        <h2 className="text-lg font-bold">Alamat Pengiriman</h2>
        {addresses.map((a) => (
          <article key={a.id} className="rounded-xl border p-3 text-sm">
            <p className="font-semibold">
              {a.recipientName} {a.isDefault && "· Utama"}
            </p>
            <p>{a.phone}</p>
            <p className="break-words">
              {[a.line, a.village, a.district, a.city, a.province]
                .filter(Boolean)
                .join(", ")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setEditing(a);
                  setLocation(
                    a.provinceCode &&
                      a.cityCode &&
                      a.districtCode &&
                      (jnt
                        ? a.districtCode.startsWith("JNT-")
                        : !!a.villageCode && !a.districtCode.startsWith("JNT-"))
                      ? {
                          provinceCode: a.provinceCode,
                          cityCode: a.cityCode,
                          districtCode: a.districtCode,
                          villageCode: a.villageCode || "",
                          postalCode: a.postalCode,
                          province: a.province,
                          city: a.city,
                          district: a.district || "",
                          village: a.village || "",
                          regionSource: a.regionSource || "",
                          regionUpdatedAt: a.regionUpdatedAt || "",
                        }
                      : null,
                  );
                }}
              >
                Edit
              </Button>
              {!a.isDefault && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    perform(() => addressChangeAction(a.id, "default"))
                  }
                >
                  Jadikan Utama
                </Button>
              )}
              <Button
                variant="outline"
                disabled={pending}
                data-confirm-title="Hapus alamat tersimpan?"
                data-confirm-description="Alamat pada pesanan lama tetap utuh."
                onClick={() => {
                  perform(() => addressChangeAction(a.id, "delete"));
                }}
              >
                Hapus
              </Button>
            </div>
          </article>
        ))}
        {!addresses.length && (
          <p className="text-sm text-zinc-500">Belum ada alamat tersimpan.</p>
        )}
        <form
          key={editing?.id || "new"}
          className="space-y-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            if (!location) {
              setMessage("Pilih lokasi pengiriman.");
              return;
            }
            const value = {
              ...location,
              recipientName: data.get("recipientName"),
              phone: data.get("phone"),
              line: data.get("line"),
              ...(jnt ? { village: data.get("village") } : {}),
            };
            void perform(
              () =>
                addressSaveAction(
                  editing?.id || null,
                  value,
                  data.get("isDefault") === "on",
                ),
              () => form.reset(),
            );
          }}
        >
          <h3 className="font-semibold">
            {editing ? "Edit Alamat" : "Tambah Alamat"}
          </h3>
          {(
            [
              ["recipientName", "Nama penerima"],
              ["phone", "Nomor telepon"],
              ["line", "Alamat lengkap"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`address-${key}`}>{label}</Label>
              <Input
                id={`address-${key}`}
                name={key}
                required
                maxLength={key === "line" ? 1000 : key === "phone" ? 25 : 100}
                defaultValue={editing?.[key] || ""}
                disabled={pending}
              />
            </div>
          ))}
          <RegionSelectorDialog
            value={location}
            onChange={setLocation}
            jntCheckout={jnt}
          />
          {jnt && (
            <div>
              <Label htmlFor="address-village">Desa / Kelurahan</Label>
              <Input
                id="address-village"
                name="village"
                required
                maxLength={150}
                defaultValue={editing?.village || ""}
                disabled={pending}
              />
            </div>
          )}
          <label className="flex gap-3 text-sm">
            <input
              name="isDefault"
              type="checkbox"
              defaultChecked={editing?.isDefault}
              disabled={pending}
            />
            Jadikan alamat utama untuk checkout
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              Simpan Alamat
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setEditing(null);
                  setLocation(null);
                }}
              >
                Batal
              </Button>
            )}
          </div>
        </form>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </section>
    </ConfirmActions>
  );
}
