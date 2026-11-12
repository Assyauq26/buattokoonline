"use client";
import { PromotionHistory } from "./promotion-history";
import { PromotionRowActions } from "./promotion-row-actions";
import {
  readPromotionSession,
  writePromotionSession,
  clearPromotionSession,
} from "./promotion-session";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Copy, Info, Plus, Ticket } from "lucide-react";
import { formatIDR } from "@/lib/money";
import {
  formatWibDate,
  voucherStatusAt,
} from "@/modules/promotions/marketing-display";
import {
  isoToWibInput,
  wibInputToIso,
} from "@/modules/promotions/campaign.validation";
import {
  saveVoucherAction,
  toggleVoucherAction,
} from "@/modules/promotions/marketing.actions";
type Voucher = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minSpend: number;
  maxDiscount: number | null;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  createdAt: string;
};
type Draft = {
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: string;
  minSpend: string;
  maxDiscount: string;
  isActive: boolean;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  perUserLimit: string;
};
const initial = (): Draft => ({
  code: "",
  discountType: "PERCENT",
  discountValue: "",
  minSpend: "0",
  maxDiscount: "",
  isActive: true,
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  perUserLimit: "",
});
function status(v: Voucher, now: number) {
  return v.isActive &&
    (!v.expiresAt || Date.parse(v.expiresAt) > now) &&
    (!v.startsAt || Date.parse(v.startsAt) <= now) &&
    v.usageLimit != null &&
    v.usedCount >= v.usageLimit
    ? "Kuota habis"
    : voucherStatusAt(v, now);
}
export function PromotionVoucherWorkspace({
  vouchers,
  canCreate,
  canUpdate,
  asOfMs,
  ownerKey,
  historyTotal,
  historyPage,
  total,
  history,
}: {
  vouchers: Voucher[];
  canCreate: boolean;
  canUpdate: boolean;
  asOfMs: number;
  ownerKey: string;
  historyTotal: number;
  historyPage: number;
  total: number;
  history: { id: string; action: string; createdAt: string }[];
}) {
  const router = useRouter(),
    params = useSearchParams();
  const view = params.get("view") || "list",
    id = params.get("id"),
    current = vouchers.find((v) => v.id === id);
  const [draft, setDraft] = useState<Draft>(initial),
    [baseline, setBaseline] = useState(""),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [now, setNow] = useState(asOfMs);
  const lock = useRef(false),
    notice = useRef<HTMLDivElement>(null);
  const [uncertain, setUncertain] = useState(false);
  const url = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      const key = ["search", "status", "page", "from", "to"].includes(k)
        ? "voucher-" + k
        : k;
      if (v == null) p.delete(key);
      else p.set(key, v);
    }
    return "/admin/marketing?" + p;
  };
  const listUrl = url({ view: null, id: null });
  const sessionKey = "promotion:voucher:" + ownerKey + ":" + (id || "new");
  const dirty =
    view !== "list" &&
    view !== "detail" &&
    !!baseline &&
    JSON.stringify(draft) !== baseline;
  useEffect(() => {
    if (dirty) writePromotionSession(sessionKey, draft);
  }, [sessionKey, draft, dirty]);
  const isDetail = view === "detail";
  const isList = view === "list";
  const selection = useRef(current);
  selection.current = current;
  useEffect(() => {
    if (isList) return;
    setUncertain(false);
    const current = selection.current;
    const next = current
      ? {
          code: current.code,
          discountType: current.discountType,
          discountValue: String(current.discountValue),
          minSpend: String(current.minSpend),
          maxDiscount:
            current.maxDiscount == null ? "" : String(current.maxDiscount),
          isActive: current.isActive,
          startsAt: current.startsAt ? isoToWibInput(current.startsAt) : "",
          expiresAt: current.expiresAt ? isoToWibInput(current.expiresAt) : "",
          usageLimit:
            current.usageLimit == null ? "" : String(current.usageLimit),
          perUserLimit:
            current.perUserLimit == null ? "" : String(current.perUserLimit),
        }
      : initial();
    const recovered = readPromotionSession<Draft>(
      isDetail ? sessionKey + ":server-only" : sessionKey,
      (v): v is Draft =>
        !!v &&
        typeof v === "object" &&
        "code" in v &&
        typeof v.code === "string" &&
        "discountType" in v &&
        ["PERCENT", "FIXED"].includes(String(v.discountType)),
    );
    setDraft(recovered || next);
    setBaseline(JSON.stringify(next));
    setFeedback(
      recovered
        ? {
            text: "Perubahan belum tersimpan dipulihkan dari sesi browser.",
            error: false,
          }
        : null,
    );
  }, [id, isList, isDetail, sessionKey]);
  useEffect(() => {
    const began = performance.now();
    const timer = setInterval(
      () => setNow(asOfMs + performance.now() - began),
      15000,
    );
    return () => clearInterval(timer);
  }, [asOfMs]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const field = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function message(text: string, error = true) {
    setFeedback({ text, error });
    if (error) requestAnimationFrame(() => notice.current?.focus());
  }
  function cancel() {
    if (
      !dirty ||
      window.confirm("Buang perubahan voucher yang belum disimpan?")
    ) {
      clearPromotionSession(sessionKey);
      router.push(listUrl);
    }
  }
  async function copy(v: Voucher) {
    try {
      await navigator.clipboard.writeText(v.code);
      message("Kode disalin.", false);
    } catch {
      message("Kode tidak dapat disalin. Pilih dan salin kode secara manual.");
    }
  }
  async function toggle(v: Voucher) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const r = await toggleVoucherAction(v.id, !v.isActive);
      if (!r.ok) message(r.error || "Status gagal disimpan.");
      else {
        message("Status voucher diperbarui.", false);
        router.refresh();
      }
    } catch {
      message(
        "Hasil belum dapat dipastikan. Muat ulang status sebelum mencoba lagi.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || uncertain) return;
    lock.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const r = await saveVoucherAction(current?.id || null, {
        code: draft.code.trim().toUpperCase(),
        discountType: draft.discountType,
        discountValue: Number(draft.discountValue),
        minSpend: Number(draft.minSpend),
        maxDiscount:
          draft.discountType === "PERCENT" && draft.maxDiscount !== ""
            ? Number(draft.maxDiscount)
            : null,
        startsAt: draft.startsAt ? wibInputToIso(draft.startsAt) : null,
        expiresAt: draft.expiresAt ? wibInputToIso(draft.expiresAt) : null,
        usageLimit: draft.usageLimit === "" ? null : Number(draft.usageLimit),
        perUserLimit:
          draft.perUserLimit === "" ? null : Number(draft.perUserLimit),
        isActive: draft.isActive,
      });
      if (!r.ok) {
        message(r.error || "Voucher gagal disimpan.");
        const text = (r.error || "").toLowerCase();
        const selector = text.includes("tanggal")
          ? "#voucher-expiry"
          : text.includes("pelanggan")
            ? "#voucher-per-customer"
            : text.includes("kuota")
              ? "#voucher-limit"
              : text.includes("kode")
                ? "#voucher-code"
                : null;
        if (selector)
          requestAnimationFrame(() => {
            const input = document.querySelector<HTMLInputElement>(selector);
            input?.closest("details")?.setAttribute("open", "");
            input?.focus();
          });
        return;
      }
      clearPromotionSession(sessionKey);
      setBaseline(JSON.stringify(draft));
      message(
        current ? "Perubahan voucher disimpan." : "Voucher berhasil dibuat.",
        false,
      );
      router.push(listUrl);
      router.refresh();
    } catch {
      setUncertain(true);
      message(
        "Hasil penyimpanan belum pasti. Periksa daftar voucher sebelum mengirim ulang.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const feedbackUI = feedback && (
    <div
      ref={notice}
      tabIndex={-1}
      className="promo-notice"
      role={feedback.error ? "alert" : "status"}
    >
      <Info size={17} />
      {feedback.text}
      {uncertain && <Link href={listUrl}>Periksa daftar voucher</Link>}
    </div>
  );
  const filtered = vouchers;
  const page = Math.max(1, Number(params.get("voucher-page")) || 1),
    visible = vouchers;
  const preview = (
    <div className="promo-voucher-preview">
      <strong>
        {draft.discountType === "PERCENT"
          ? `${draft.discountValue || "0"}% OFF`
          : formatIDR(Number(draft.discountValue) || 0)}
      </strong>
      <code>{draft.code || "KODE VOUCHER"}</code>
      <p>Min. belanja {formatIDR(Number(draft.minSpend) || 0)}</p>
      {draft.discountType === "PERCENT" && draft.maxDiscount && (
        <p>Maks. diskon {formatIDR(Number(draft.maxDiscount))}</p>
      )}
      <p>Per pelanggan: {draft.perUserLimit || "tanpa batas"}</p>
      <p>Kuota total: {draft.usageLimit || "tanpa batas"}</p>
      {draft.startsAt && (
        <p>Mulai {formatWibDate(wibInputToIso(draft.startsAt))}</p>
      )}
      {draft.expiresAt && (
        <p>Berakhir {formatWibDate(wibInputToIso(draft.expiresAt))}</p>
      )}
    </div>
  );
  if (view === "list")
    return (
      <section>
        {feedbackUI}
        <div className="promo-tools">
          <form
            className="promo-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(
                url({
                  search:
                    new FormData(e.currentTarget).get("search")?.toString() ||
                    null,
                  page: null,
                }),
              );
            }}
          >
            <input
              name="search"
              key={params.get("voucher-search")}
              aria-label="Cari kode voucher"
              placeholder="Cari kode voucher"
              defaultValue={params.get("voucher-search") || ""}
            />
            <button className="sr-only">Cari</button>
          </form>
          <select
            className="max-w-48"
            aria-label="Status voucher"
            value={params.get("voucher-status") || ""}
            onChange={(e) =>
              router.push(url({ status: e.target.value || null, page: null }))
            }
          >
            <option value="">Semua status</option>
            {[
              "Aktif",
              "Terjadwal",
              "Nonaktif",
              "Kedaluwarsa",
              "Kuota habis",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {canCreate && (
            <Link
              className="promo-button promo-primary"
              href={url({ view: "new", id: null })}
            >
              <Plus size={16} />
              Buat voucher
            </Link>
          )}
        </div>
        {!filtered.length ? (
          <div className="promo-empty">
            <Ticket size={40} />
            <h2>
              {total > 0 ||
              params.get("voucher-search") ||
              params.get("voucher-status")
                ? "Voucher tidak ditemukan"
                : "Belum ada voucher"}
            </h2>
            <p>Buat voucher untuk digunakan customer saat checkout.</p>
          </div>
        ) : (
          <table className="promo-table promo-voucher-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Diskon</th>
                <th>Syarat</th>
                <th>Periode WIB</th>
                <th>Pemakaian</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="promo-actions">
                      <strong>{v.code}</strong>
                      <button
                        aria-label={`Salin kode ${v.code}`}
                        onClick={() => void copy(v)}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </td>
                  <td>
                    {v.discountType === "PERCENT"
                      ? `${v.discountValue}%`
                      : formatIDR(v.discountValue)}
                  </td>
                  <td>
                    Min. {formatIDR(v.minSpend)}
                    {v.discountType === "PERCENT" && v.maxDiscount != null && (
                      <small className="block">
                        Maks. {formatIDR(v.maxDiscount)}
                      </small>
                    )}
                  </td>
                  <td className="text-xs">
                    {v.startsAt ? formatWibDate(v.startsAt) : "Mulai langsung"}
                    <br />
                    {v.expiresAt
                      ? formatWibDate(v.expiresAt)
                      : "Tanpa tanggal akhir"}
                  </td>
                  <td data-label="Kuota">
                    {v.usedCount}/{v.usageLimit ?? "∞"}
                  </td>
                  <td>
                    <span className="promo-badge" data-state={status(v, now)}>
                      {status(v, now)}
                    </span>
                  </td>
                  <td>
                    <PromotionRowActions label={v.code}>
                      <Link
                        className="promo-button"
                        href={url({ view: "detail", id: v.id })}
                      >
                        Detail
                      </Link>
                      {canUpdate && (
                        <>
                          <Link
                            className="promo-button"
                            href={url({ view: "edit", id: v.id })}
                          >
                            Edit
                          </Link>
                          <button
                            disabled={
                              pending ||
                              (!v.isActive &&
                                (status({ ...v, isActive: true }, now) ===
                                  "Kedaluwarsa" ||
                                  status({ ...v, isActive: true }, now) ===
                                    "Kuota habis"))
                            }
                            onClick={() => void toggle(v)}
                          >
                            {v.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </>
                      )}
                    </PromotionRowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="promo-pagination">
          {page > 1 && (
            <Link href={url({ page: String(page - 1) })}>Sebelumnya</Link>
          )}
          <span>
            {page} · {total} voucher
          </span>
          {page * 12 < total && (
            <Link href={url({ page: String(page + 1) })}>Berikutnya</Link>
          )}
        </div>
      </section>
    );
  if (id && !current)
    return (
      <div className="promo-empty">
        <h2>Voucher tidak ditemukan</h2>
        <Link href={listUrl}>Kembali ke daftar</Link>
      </div>
    );
  if (view === "detail" && current)
    return (
      <section>
        {feedbackUI}
        <div className="promo-form-title">
          <Link href={listUrl} aria-label="Kembali">
            <ArrowLeft size={18} />
          </Link>
          <h1>Detail voucher — {current.code}</h1>
          <span className="promo-badge" data-state={status(current, now)}>
            {status(current, now)}
          </span>
        </div>
        <div className="promo-form-grid">
          <div className="promo-panel">
            {preview}
            <div className="promo-fields">
              <p>
                Pemakaian: {current.usedCount} /{" "}
                {current.usageLimit ?? "tanpa batas"}
                {current.usageLimit != null &&
                  ` (tersisa ${Math.max(0, current.usageLimit - current.usedCount)})`}
              </p>
              <p className="promo-muted">
                Pesanan menunggu pembayaran menahan satu pemakaian. Pembatalan
                atau kedaluwarsa pembayaran melepaskannya.
              </p>
            </div>
            <PromotionHistory
              entries={history}
              page={historyPage}
              total={historyTotal}
              pageUrl={(page) => url({ "voucher-history-page": String(page) })}
              expanded
            />
          </div>
          <aside className="promo-panel">
            <h3>Ketentuan</h3>
            <p>Voucher dihitung dari subtotal setelah harga Flash Sale.</p>
            <p className="promo-muted">
              Perubahan voucher tidak menghitung ulang diskon pada pesanan lama.
            </p>
          </aside>
        </div>
        <div className="promo-actions mt-4">
          <button onClick={() => void copy(current)}>Salin kode</button>
          {canUpdate && (
            <Link
              className="promo-button promo-primary"
              href={url({ view: "edit" })}
            >
              Edit voucher
            </Link>
          )}
        </div>
      </section>
    );
  return (
    <form
      className="promo-form"
      onSubmit={submit}
      onInvalid={(e) => {
        const element = e.target as HTMLElement;
        element.closest("details")?.setAttribute("open", "");
        requestAnimationFrame(() => element.focus());
      }}
    >
      <div className="promo-form-title">
        <button type="button" onClick={cancel} aria-label="Kembali">
          <ArrowLeft size={18} />
        </button>
        <h1>{current ? "Edit voucher" : "Buat voucher"}</h1>
      </div>
      {feedbackUI}
      <fieldset
        disabled={
          pending || (!current && !canCreate) || (!!current && !canUpdate)
        }
        className="promo-form-grid"
      >
        <div>
          <details className="promo-panel" open>
            <summary>Identitas & diskon</summary>
            <label>
              Kode voucher *
              <input
                id="voucher-code"
                value={draft.code}
                onChange={(e) => field("code", e.target.value.toUpperCase())}
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}"
                readOnly={!!current}
              />
            </label>
            <p className="promo-muted">
              Dipakai customer saat checkout. Kode tersimpan tidak dapat diubah.
            </p>
            <div className="promo-fields">
              <div>
                <label>Jenis diskon *</label>
                <div className="promo-segment">
                  {(["PERCENT", "FIXED"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={draft.discountType === type}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          discountType: type,
                          maxDiscount: "",
                        }))
                      }
                    >
                      {type === "PERCENT" ? "Persentase (%)" : "Nominal Rupiah"}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Nilai diskon ({draft.discountType === "PERCENT" ? "%" : "Rp"}) *
                <input
                  id="voucher-value"
                  type="number"
                  min="1"
                  max={draft.discountType === "PERCENT" ? 100 : 2147483647}
                  step="1"
                  value={draft.discountValue}
                  onChange={(e) => field("discountValue", e.target.value)}
                  required
                />
              </label>
              <div className="promo-two">
                <label>
                  Minimal belanja (Rp) *
                  <input
                    id="voucher-min"
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    value={draft.minSpend}
                    onChange={(e) => field("minSpend", e.target.value)}
                    required
                  />
                </label>
                {draft.discountType === "PERCENT" && (
                  <label>
                    Maksimal diskon (opsional)
                    <input
                      id="voucher-max"
                      type="number"
                      min="1"
                      max="2147483647"
                      step="1"
                      value={draft.maxDiscount}
                      onChange={(e) => field("maxDiscount", e.target.value)}
                      placeholder="Tanpa batas"
                    />
                  </label>
                )}
              </div>
            </div>
          </details>
          <details className="promo-panel">
            <summary>Jadwal · WIB</summary>
            <label className="promo-inline-check">
              <input
                type="checkbox"
                checked={!draft.startsAt}
                onChange={(e) =>
                  field(
                    "startsAt",
                    e.target.checked
                      ? ""
                      : isoToWibInput(new Date().toISOString()).slice(0, 16),
                  )
                }
              />
              Mulai sekarang
            </label>
            {draft.startsAt && (
              <label>
                Mulai berlaku
                <input
                  id="voucher-start"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) => field("startsAt", e.target.value)}
                />
              </label>
            )}
            <label className="promo-inline-check">
              <input
                type="checkbox"
                checked={!draft.expiresAt}
                onChange={(e) =>
                  field(
                    "expiresAt",
                    e.target.checked
                      ? ""
                      : isoToWibInput(
                          new Date(Date.now() + 86400000).toISOString(),
                        ).slice(0, 16),
                  )
                }
              />
              Tanpa tanggal akhir
            </label>
            {draft.expiresAt && (
              <label>
                Berakhir
                <input
                  id="voucher-expiry"
                  type="datetime-local"
                  value={draft.expiresAt}
                  onChange={(e) => field("expiresAt", e.target.value)}
                />
              </label>
            )}
          </details>
          <details className="promo-panel">
            <summary>Batas penggunaan</summary>
            <div className="promo-fields">
              {(["usageLimit", "perUserLimit"] as const).map((key) => (
                <div key={key}>
                  <label>
                    {key === "usageLimit"
                      ? "Kuota total"
                      : "Batas per pelanggan"}
                    <input
                      id={
                        key === "usageLimit"
                          ? "voucher-limit"
                          : "voucher-per-customer"
                      }
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      value={draft[key]}
                      onChange={(e) => field(key, e.target.value)}
                      placeholder="Tanpa batas"
                    />
                  </label>
                  <label className="promo-inline-check">
                    <input
                      type="checkbox"
                      checked={draft[key] === ""}
                      onChange={(e) => field(key, e.target.checked ? "" : "1")}
                    />
                    Tanpa batas
                  </label>
                </div>
              ))}
            </div>
          </details>
          <div className="promo-panel">
            <label>
              Status setelah disimpan
              <select
                value={draft.isActive ? "active" : "inactive"}
                onChange={(e) => field("isActive", e.target.value === "active")}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </label>
            <p className="promo-muted">
              Jika mulai di masa depan, voucher aktif akan berstatus Terjadwal.
            </p>
          </div>
        </div>
        <aside className="promo-aside">
          <details className="promo-panel" open>
            <summary>Pratinjau voucher</summary>
            {preview}
          </details>
          <p className="promo-notice">
            Voucher dihitung dari subtotal setelah harga Flash Sale.
          </p>
        </aside>
      </fieldset>
      <footer className="promo-footer">
        <button type="button" disabled={pending} onClick={cancel}>
          Batal
        </button>
        <button
          className="promo-primary"
          type="submit"
          disabled={
            pending ||
            uncertain ||
            (!current && !canCreate) ||
            (!!current && !canUpdate)
          }
        >
          {pending
            ? "Menyimpan…"
            : current
              ? "Simpan perubahan"
              : "Buat voucher"}
        </button>
      </footer>
    </form>
  );
}
