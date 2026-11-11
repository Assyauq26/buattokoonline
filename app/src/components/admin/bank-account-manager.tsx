"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveBankAccountAction,
  toggleBankAccountAction,
  deleteBankAccountAction,
} from "@/modules/payments/bank.actions";
import { SaveLabel, SettingsFeedback } from "./settings-feedback";
type Account = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  displayName: string;
  isActive: boolean;
  updatedAt: string;
};
export function BankAccountManager({ accounts }: { accounts: Account[] }) {
  const [editing, setEditing] = useState<Account | null>(null),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    form = useRef<HTMLFormElement>(null),
    router = useRouter();
  async function run(
    action: () => Promise<{
      ok: boolean;
      error?: string;
      data?: { message?: string };
    }>,
    saved?: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      setMessage(
        result.ok
          ? result.data?.message || "Tersimpan."
          : result.error || "Belum tersimpan.",
      );
      if (result.ok) {
        saved?.();
        router.refresh();
      }
    } catch {
      setMessage("Koneksi terputus. Isian tetap tersedia, silakan coba lagi.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function cancel() {
    setEditing(null);
    form.current?.reset();
    setMessage("");
  }
  return (
    <div className="settings-form">
      <p className="text-sm text-zinc-600">
        Rekening penerima pembayaran customer. Perubahan tidak mengubah rincian
        pembayaran lama.
      </p>
      <SettingsFeedback message={message} />
      <div className="settings-bank-grid">
        <div className="settings-bank-list">
          {!accounts.length && (
            <p className="settings-card text-sm">
              Belum ada rekening. Tambahkan rekening untuk menerima transfer
              bank.
            </p>
          )}
          {accounts.map((a) => (
            <article key={a.id} className="settings-bank-row">
              <header>
                <strong>{a.bankName}</strong>
                <span>{a.isActive ? "Aktif" : "Nonaktif"}</span>
              </header>
              <p>
                •••• {a.accountNumber.slice(-4)} · {a.accountHolder}
              </p>
              <small>{a.displayName}</small>
              <div className="settings-bank-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(a);
                    setMessage("");
                    requestAnimationFrame(() =>
                      form.current
                        ?.querySelector<HTMLInputElement>('[name="bankName"]')
                        ?.focus({ preventScroll: false }),
                    );
                  }}
                >
                  Ubah
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      toggleBankAccountAction(a.id, a.updatedAt, !a.isActive),
                    )
                  }
                >
                  {a.isActive ? "Nonaktifkan" : "Aktifkan"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Hapus rekening dari pilihan pembayaran? Riwayat pembayaran tetap disimpan.",
                      )
                    )
                      void run(
                        () => deleteBankAccountAction(a.id, a.updatedAt),
                        () => {
                          if (editing?.id === a.id) {
                            setEditing(null);
                            form.current?.reset();
                          }
                        },
                      );
                  }}
                >
                  Hapus
                </button>
              </div>
            </article>
          ))}
        </div>
        <form
          key={editing?.id || "new"}
          ref={form}
          className="settings-card identity-fields"
          data-testid="bank-form"
          onSubmit={(e) => {
            e.preventDefault();
            const target = e.currentTarget;
            const input = Object.fromEntries(new FormData(target).entries());
            void run(
              () =>
                saveBankAccountAction(
                  editing?.id || null,
                  editing?.updatedAt || "",
                  input,
                ),
              () => {
                setEditing(null);
                target.reset();
              },
            );
          }}
        >
          <h2>{editing ? "Ubah rekening" : "Tambah rekening"}</h2>
          <fieldset disabled={busy} className="identity-fields">
            {[
              ["bankName", "Bank"],
              ["accountNumber", "Nomor rekening"],
              ["accountHolder", "Nama pemilik rekening"],
              ["displayName", "Nama tampilan"],
            ].map(([name, label]) => (
              <label key={name} className="setting-field">
                {label}
                <input
                  name={name}
                  required
                  defaultValue={
                    (editing?.[name as keyof Account] as string) || ""
                  }
                  minLength={name === "accountNumber" ? 3 : 2}
                  maxLength={name === "accountNumber" ? 34 : 100}
                  inputMode={name === "accountNumber" ? "numeric" : undefined}
                  pattern={name === "accountNumber" ? "[0-9]{3,34}" : undefined}
                  autoComplete="off"
                />
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {editing && (
              <button
                type="button"
                className="setting-outline"
                disabled={busy}
                onClick={cancel}
              >
                Batal
              </button>
            )}
            <button
              className="setting-primary"
              disabled={busy}
              data-testid="bank-submit"
            >
              <SaveLabel busy={busy}>Simpan rekening</SaveLabel>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
