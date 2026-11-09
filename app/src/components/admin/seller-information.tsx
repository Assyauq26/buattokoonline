"use client";
import { useState, useRef } from "react";
import { saveSellerName } from "@/modules/admin/seller-profile.actions";
import { useRouter } from "next/navigation";
import { UnsavedFormGuard } from "@/components/ui/unsaved-form-guard";
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
  const [name, setName] = useState(profile.name),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    router = useRouter();
  return (
    <UnsavedFormGuard revision={profile.updatedAt}>
      <form
        className="grid gap-5 rounded-xl border bg-white p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            const r = await saveSellerName({
              name,
              revision: profile.updatedAt,
            });
            setMessage(
              r.ok
                ? r.data?.message || "Tersimpan."
                : r.error || "Gagal menyimpan",
            );
            if (r.ok) router.refresh();
          } catch {
            setMessage("Koneksi terputus. Isian tetap tersimpan.");
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <h1 className="text-2xl font-bold">Informasi Seller</h1>
        <label className="grid gap-2">
          Nama penanggung jawab
          <input
            className="min-h-11 rounded-lg border px-3"
            value={name}
            required
            minLength={2}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="grid gap-2">
          Email akun
          <input
            className="min-h-11 rounded-lg border px-3"
            value={profile.email}
            readOnly
          />
        </label>
        <label className="grid gap-2">
          Nomor telepon pribadi
          <input
            className="min-h-11 rounded-lg border px-3"
            value={profile.phone || ""}
            readOnly
          />
        </label>
        <p className="text-sm">
          Data pribadi tidak ditampilkan di storefront. Identitas email dan
          telepon login dipertahankan; perubahan identitas memerlukan
          verifikasi.
        </p>
        <button
          disabled={busy}
          className="min-h-11 rounded-xl bg-primary p-3 text-white"
        >
          {busy ? "Menyimpan…" : "Simpan profil"}
        </button>
        <p role="status">{message}</p>
      </form>
    </UnsavedFormGuard>
  );
}
