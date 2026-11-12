"use client";
import { PromotionHistory } from "./promotion-history";
import Image from "next/image";
import { PromotionRowActions } from "./promotion-row-actions";
import {
  readPromotionSession,
  writePromotionSession,
  clearPromotionSession,
} from "./promotion-session";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Info,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { formatIDR } from "@/lib/money";
import { formatWibDate } from "@/modules/promotions/marketing-display";
import {
  campaignState,
  isoToWibInput,
  wibInputToIso,
} from "@/modules/promotions/campaign.validation";
import {
  campaignProductsAction,
  saveCampaignAction,
  saveCampaignDraftAction,
  deleteCampaignDraftAction,
  endCampaignAction,
} from "@/modules/promotions/campaign.actions";
import type { listCampaigns } from "@/modules/promotions/campaign.service";
import { PromotionProductPicker } from "./promotion-product-picker";
import {
  emptyCampaign,
  statusNames,
  validateOffers,
  offerFieldError,
  type CampaignForm,
  type PromotionProduct,
} from "./promotion-domain";
type Row = Omit<
  Awaited<ReturnType<typeof listCampaigns>>[number],
  "startsAt" | "endsAt"
> & { startsAt: string; endsAt: string };
type StoredDraft = {
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  items: {
    productId: string;
    skuOffers: {
      variantId: string;
      price: number | null;
      quota: number | null;
    }[];
  }[];
};
export function PromotionFlashWorkspace({
  campaigns,
  initialProducts,
  categories,
  history,
  canCreate,
  canUpdate,
  serverNow,
  ownerKey,
  historyTotal,
  historyPage,
  total,
}: {
  campaigns: Row[];
  initialProducts: { items: PromotionProduct[]; page: number; total: number };
  categories: { id: string; name: string }[];
  history: {
    id: string;
    entityId: string | null;
    action: string;
    createdAt: string;
  }[];
  canCreate: boolean;
  canUpdate: boolean;
  serverNow: number;
  ownerKey: string;
  historyTotal: number;
  historyPage: number;
  total: number;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const view = params.get("view") || "list",
    id = params.get("id"),
    step = Math.min(3, Math.max(1, Number(params.get("step")) || 1));
  const current = campaigns.find((c) => c.id === id);
  const [form, setForm] = useState<CampaignForm>(emptyCampaign),
    [baseline, setBaseline] = useState(""),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false),
    [picker, setPicker] = useState(false),
    [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [bulk, setBulk] = useState(false),
    [bulkPrice, setBulkPrice] = useState(""),
    [bulkQuota, setBulkQuota] = useState(""),
    [scope, setScope] = useState("all"),
    [checked, setChecked] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [uncertain, setUncertain] = useState(false),
    [pendingAction, setPendingAction] = useState<"draft" | "schedule" | null>(
      null,
    );
  const busy = useRef(false),
    notice = useRef<HTMLDivElement>(null);
  const isDetail = view === "detail";
  const isList = view === "list";
  const selection = useRef({ current, view });
  selection.current = { current, view };
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const began = performance.now();
    const timer = setInterval(
      () => setNow(serverNow + performance.now() - began),
      15000,
    );
    return () => clearInterval(timer);
  }, [serverNow]);
  const sessionKey = "promotion:flash:" + ownerKey + ":" + (id || "new");
  const dirty =
    view !== "list" &&
    view !== "detail" &&
    !!baseline &&
    JSON.stringify(form) !== baseline;
  useEffect(() => {
    if (dirty) writePromotionSession(sessionKey, form);
  }, [sessionKey, form, dirty]);
  const url = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      const key = ["search", "status", "page", "from", "to"].includes(k)
        ? "flash-" + k
        : k;
      if (v === null) p.delete(key);
      else p.set(key, v);
    }
    return "/admin/marketing?" + p;
  };
  const listUrl = url({ view: null, id: null, step: null });
  function message(text: string, error = true) {
    setFeedback({ text, error });
    if (error) requestAnimationFrame(() => notice.current?.focus());
  }
  function navigate(target: string) {
    if (!dirty || window.confirm("Buang perubahan yang belum disimpan?")) {
      clearPromotionSession(sessionKey);
      router.push(target);
    }
  }
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    let active = true;
    const { current, view } = selection.current;
    async function init() {
      if (view === "list") return;
      setLoading(true);
      try {
        let next = emptyCampaign();
        if (current) {
          next = {
            requestId: current.id,
            id: current.id,
            version: current.version,
            name: current.name,
            start: isoToWibInput(current.startsAt),
            end: isoToWibInput(current.endsAt),
            items: current.items.map((item) => ({
              productId: item.productId,
              name: item.product.name,
              image: item.product.image,
              legacy: false,
              variants: item.product.variants.map((v) => ({
                id: v.id,
                sku: v.sku,
                label: v.label,
                regularPrice:
                  v.price != null
                    ? v.salePrice && v.salePrice < v.price
                      ? v.salePrice
                      : v.price
                    : item.product.regularPrice,
                stock: v.inventory
                  ? v.inventory.onHand - v.inventory.reserved
                  : 0,
              })),
              offers: item.skuOffers.length
                ? item.skuOffers.map((o) => ({
                    variantId: o.variantId,
                    price: String(o.price),
                    quota: String(o.quota),
                    usedCount: o.usedCount,
                  }))
                : item.product.variants.map((v) => ({
                    variantId: v.id,
                    price: String(item.flashSalePrice),
                    quota: "",
                  })),
            })),
          };
          if (current.draft && typeof current.draft === "object") {
            const draft = current.draft as unknown as StoredDraft;
            const result = await campaignProductsAction({
              ids: draft.items.map((i) => i.productId),
            });
            if (!result.ok || !result.data)
              throw new Error(result.error || "Produk draf gagal dimuat.");
            next = {
              ...next,
              name: draft.name,
              start: draft.startsAt ? isoToWibInput(draft.startsAt) : "",
              end: draft.endsAt ? isoToWibInput(draft.endsAt) : "",
              items: draft.items.map((item) => {
                const product = result.data!.items.find(
                  (p) => p.id === item.productId,
                );
                return {
                  productId: item.productId,
                  name: product?.name || "Produk tidak tersedia",
                  image: product?.image || null,
                  legacy: product?.legacy || false,
                  variants: product?.variants || [],
                  offers: item.skuOffers.map((o) => ({
                    variantId: o.variantId,
                    price: o.price == null ? "" : String(o.price),
                    quota: o.quota == null ? "" : String(o.quota),
                  })),
                };
              }),
            };
          }
        }
        if (active) {
          setUncertain(false);
          const recovered = readPromotionSession<CampaignForm>(
            isDetail ? sessionKey + ":server-only" : sessionKey,
            (v): v is CampaignForm =>
              !!v &&
              typeof v === "object" &&
              "version" in v &&
              v.version === next.version &&
              "name" in v &&
              typeof v.name === "string" &&
              "items" in v &&
              Array.isArray(v.items),
          );
          setForm(recovered || next);
          setBaseline(JSON.stringify(next));
          setFeedback(
            recovered
              ? {
                  text: "Perubahan belum tersimpan dipulihkan dari sesi browser.",
                  error: false,
                }
              : null,
          );
          setChecked(new Set());
        }
      } catch (e) {
        if (active)
          message(e instanceof Error ? e.message : "Data gagal dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [id, isList, isDetail, sessionKey]);
  const source = campaigns;
  const page = Math.max(1, Number(params.get("flash-page")) || 1),
    visible = campaigns;
  const state = current ? campaignState(current, now) : null;
  const canEdit =
    !!current && canUpdate && ["DRAFT", "UPCOMING"].includes(state!);
  const readonly = view === "detail";
  const startsImmediately = Boolean(
    form.start && Date.parse(form.start + "+07:00") <= now,
  );
  function validateSchedule() {
    if (form.name.trim().length < 2)
      return "Isi nama kampanye minimal 2 karakter.";
    try {
      if (
        !form.start ||
        !form.end ||
        Date.parse(wibInputToIso(form.start)) >=
          Date.parse(wibInputToIso(form.end))
      )
        return "Waktu berakhir harus setelah mulai.";
    } catch {
      return "Isi waktu WIB yang valid.";
    }
    return null;
  }
  function nextStep() {
    const error = step === 1 ? validateSchedule() : validateOffers(form.items);
    if (error) {
      setAttempted(true);
      message(error);
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLInputElement>(
          '.promo-form input[aria-invalid="true"]',
        );
        for (
          let parent = field?.parentElement;
          parent;
          parent = parent.parentElement
        )
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        field?.focus();
      });
      return;
    }
    setAttempted(false);
    setFeedback(null);
    router.push(url({ step: String(step + 1) }));
  }
  async function save(draft: boolean) {
    if (busy.current || uncertain) return;
    const error = draft
      ? null
      : validateSchedule() || validateOffers(form.items);
    if (error) {
      message(error);
      return;
    }
    busy.current = true;
    setPending(true);
    setPendingAction(draft ? "draft" : "schedule");
    setFeedback(null);
    try {
      const payload = {
        requestId: form.requestId,
        id: form.id,
        expectedVersion: form.version,
        name: form.name,
        startsAt: form.start ? wibInputToIso(form.start) : null,
        endsAt: form.end ? wibInputToIso(form.end) : null,
        items: form.items.map((p) => ({
          productId: p.productId,
          skuOffers: p.offers.map((o) => ({
            variantId: o.variantId,
            price: o.price ? Number(o.price) : null,
            quota: o.quota ? Number(o.quota) : null,
          })),
        })),
      };
      const result = draft
        ? await saveCampaignDraftAction(payload)
        : await saveCampaignAction({
            ...payload,
            status: "SCHEDULED",
            items: payload.items.map((p) => ({
              ...p,
              flashSalePrice: Math.min(...p.skuOffers.map((o) => o.price!)),
            })),
          });
      if (!result.ok) {
        message(result.error || "Kampanye gagal disimpan.");
        return;
      }
      clearPromotionSession(sessionKey);
      setBaseline(JSON.stringify(form));
      message(
        draft
          ? "Draf berhasil disimpan."
          : result.data &&
              "state" in result.data &&
              result.data.state === "ACTIVE"
            ? "Kampanye berhasil dimulai."
            : "Kampanye berhasil dijadwalkan.",
        false,
      );
      router.push(listUrl);
      router.refresh();
    } catch {
      setUncertain(true);
      message(
        "Hasil penyimpanan belum dapat dipastikan. Periksa daftar kampanye sebelum mencoba kembali.",
      );
    } finally {
      busy.current = false;
      setPending(false);
      setPendingAction(null);
    }
  }
  async function lifecycle(row: Row, remove = false) {
    if (busy.current) return;
    if (
      !window.confirm(
        remove
          ? "Hapus draf ini?"
          : `${campaignState(row, now) === "ACTIVE" ? "Akhiri" : "Batalkan"} kampanye ini? Harga pada pesanan lama tetap tersimpan.`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    try {
      const r = remove
        ? await deleteCampaignDraftAction(row.id, row.version)
        : await endCampaignAction({ id: row.id, expectedVersion: row.version });
      if (!r.ok) message(r.error || "Tindakan gagal.");
      else {
        message(remove ? "Draf dihapus." : "Kampanye diperbarui.", false);
        router.refresh();
      }
    } catch {
      message("Hasil belum pasti. Periksa status sebelum mencoba lagi.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const notices = feedback && (
    <div
      ref={notice}
      tabIndex={-1}
      role={feedback.error ? "alert" : "status"}
      className="promo-notice"
    >
      <Info size={17} />
      {feedback.text}
      {uncertain && <Link href={listUrl}>Periksa daftar kampanye</Link>}
    </div>
  );
  if (view === "list")
    return (
      <section>
        {notices}
        <div className="promo-tools">
          <form
            className="promo-search"
            onSubmit={(e) => {
              e.preventDefault();
              const value =
                new FormData(e.currentTarget).get("search")?.toString() || null;
              router.push(url({ search: value, page: null }));
            }}
          >
            <input
              key={params.get("flash-search")}
              name="search"
              aria-label="Cari kampanye"
              placeholder="Cari kampanye"
              defaultValue={params.get("flash-search") || ""}
            />
            <button type="submit" className="sr-only">
              Cari
            </button>
          </form>
          {canCreate && (
            <Link
              className="promo-button promo-primary"
              href={url({ view: "new", id: null, step: "1" })}
            >
              <Plus size={16} />
              Buat Flash Sale
            </Link>
          )}
        </div>
        <nav aria-label="Status kampanye" className="promo-filter">
          {[["", "Semua"], ...Object.entries(statusNames)].map(
            ([key, label]) => (
              <Link
                key={key}
                href={url({ status: key || null, page: null })}
                aria-current={
                  (params.get("flash-status") || "") === key
                    ? "page"
                    : undefined
                }
              >
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="promo-two">
          <label>
            Dari tanggal
            <input
              type="date"
              aria-label="Periode mulai"
              value={params.get("flash-from") || ""}
              onChange={(e) =>
                router.push(url({ from: e.target.value || null, page: null }))
              }
            />
          </label>
          <label>
            Sampai tanggal
            <input
              type="date"
              aria-label="Periode akhir"
              value={params.get("flash-to") || ""}
              onChange={(e) =>
                router.push(url({ to: e.target.value || null, page: null }))
              }
            />
          </label>
        </div>
        {!source.length ? (
          <div className="promo-empty">
            <Tag size={40} />
            <h2>
              {total > 0 ||
              params.get("flash-search") ||
              params.get("flash-status") ||
              params.get("flash-from") ||
              params.get("flash-to")
                ? "Tidak ada kampanye yang cocok"
                : "Belum ada Flash Sale"}
            </h2>
            <p>Buat kampanye Flash Sale untuk menarik lebih banyak pembeli.</p>
            {canCreate && (
              <Link
                className="promo-button promo-primary"
                href={url({ view: "new", step: "1" })}
              >
                Buat Flash Sale
              </Link>
            )}
          </div>
        ) : (
          <table className="promo-table promo-campaign-table">
            <thead>
              <tr>
                <th>Nama kampanye</th>
                <th>Periode (WIB)</th>
                <th>Produk</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const status = campaignState(c, now);
                const draft = c.draft as unknown as StoredDraft | null;
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>
                      {draft && !draft.startsAt ? (
                        "Jadwal belum lengkap"
                      ) : (
                        <>
                          {formatWibDate(c.startsAt)}
                          <br />
                          {formatWibDate(c.endsAt)}
                        </>
                      )}
                    </td>
                    <td data-label="Produk">
                      {draft?.items.length ?? c.items.length}
                    </td>
                    <td>
                      <span className="promo-badge" data-state={status}>
                        {statusNames[status]}
                      </span>
                    </td>
                    <td>
                      <PromotionRowActions label={c.name}>
                        <Link
                          className="promo-button"
                          href={url({ view: "detail", id: c.id, step: null })}
                        >
                          Detail
                        </Link>
                        {canUpdate &&
                          ["DRAFT", "UPCOMING"].includes(status) && (
                            <Link
                              className="promo-button"
                              href={url({ view: "edit", id: c.id, step: "1" })}
                            >
                              Edit
                            </Link>
                          )}
                        {canUpdate &&
                          ["DRAFT", "UPCOMING", "ACTIVE"].includes(status) && (
                            <button
                              disabled={pending}
                              onClick={() =>
                                void lifecycle(c, status === "DRAFT")
                              }
                            >
                              {status === "DRAFT"
                                ? "Hapus draf"
                                : status === "ACTIVE"
                                  ? "Akhiri"
                                  : "Batalkan"}
                            </button>
                          )}
                      </PromotionRowActions>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="promo-pagination">
          {page > 1 && (
            <Link href={url({ page: String(page - 1) })}>Sebelumnya</Link>
          )}
          <span>
            Halaman {page} · {total} kampanye
          </span>
          {page * 12 < total && (
            <Link href={url({ page: String(page + 1) })}>Berikutnya</Link>
          )}
        </div>
        <details className="promo-history">
          <summary>Riwayat kampanye</summary>
          <div className="promo-actions">
            <Link href={url({ status: "ENDED", page: null })}>
              Semua kampanye selesai
            </Link>
            <Link href={url({ status: "CANCELLED", page: null })}>
              Semua kampanye dibatalkan
            </Link>
          </div>
          <ul>
            {campaigns
              .filter((c) =>
                ["ENDED", "CANCELLED"].includes(campaignState(c, now)),
              )
              .map((c) => (
                <li key={c.id}>
                  <Link href={url({ view: "detail", id: c.id })}>
                    {c.name} · {statusNames[campaignState(c, now)]}
                  </Link>
                </li>
              ))}
          </ul>
        </details>
        <PromotionHistory
          entries={history}
          page={historyPage}
          total={historyTotal}
          pageUrl={(page) => url({ "flash-history-page": String(page) })}
        />
      </section>
    );
  if (id && !current)
    return (
      <div className="promo-empty">
        <h2>Kampanye tidak ditemukan</h2>
        <Link href={listUrl}>Kembali ke daftar</Link>
      </div>
    );
  if (loading) return <p role="status">Memuat kampanye…</p>;
  const summary = (
    <aside className="promo-panel promo-aside">
      <h3>Ringkasan</h3>
      <div className="promo-fields">
        <p>
          <CalendarDays size={17} />{" "}
          {form.start
            ? formatWibDate(wibInputToIso(form.start))
            : "Jadwal belum diisi"}
          {form.end && <> — {formatWibDate(wibInputToIso(form.end))}</>}
        </p>
        <p>
          {form.items.length} produk ·{" "}
          {form.items.reduce((s, p) => s + p.offers.length, 0)} SKU
        </p>
        <p className="promo-muted">
          Harga reguler tetap tersimpan. Kuota promo diperiksa bersama stok pada
          checkout.
        </p>
        <p className="promo-muted">
          Voucher dapat digunakan bersama Flash Sale sesuai ketentuan voucher.
        </p>
      </div>
    </aside>
  );
  return (
    <section className="promo-form promo-flash-form">
      <div className="promo-form-title">
        <button
          aria-label={
            !readonly && step > 1
              ? "Kembali ke langkah sebelumnya"
              : "Kembali ke daftar"
          }
          disabled={pending}
          onClick={() =>
            !readonly && step > 1
              ? router.push(url({ step: String(step - 1) }))
              : navigate(listUrl)
          }
        >
          <ArrowLeft size={18} />
        </button>
        <h1>
          {readonly
            ? "Detail kampanye"
            : current
              ? "Edit Flash Sale"
              : "Buat Flash Sale"}
        </h1>
        {readonly && (
          <span className="promo-badge" data-state={state}>
            {statusNames[state!]}
          </span>
        )}
      </div>
      {notices}
      {!readonly && (
        <nav className="promo-steps" aria-label="Langkah pembuatan">
          {["Jadwal", "Produk & harga", "Tinjau"].map((label, i) => (
            <div
              key={label}
              className="promo-step"
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
              {label}
            </div>
          ))}
        </nav>
      )}
      <fieldset disabled={pending} className="promo-form-grid">
        <div>
          {!readonly && step === 1 && (
            <div className="promo-panel">
              <h2>Atur jadwal kampanye</h2>
              <p className="promo-muted">
                Tentukan nama dan periode Flash Sale.
              </p>
              <div className="promo-fields">
                <label>
                  Nama kampanye *
                  <input
                    id="campaign-name"
                    aria-invalid={attempted && form.name.trim().length < 2}
                    value={form.name}
                    maxLength={120}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Mulai (WIB) *
                  <input
                    id="campaign-start"
                    aria-invalid={attempted && !form.start}
                    type="datetime-local"
                    value={form.start}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, start: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Berakhir (WIB) *
                  <input
                    id="campaign-end"
                    aria-invalid={
                      attempted &&
                      (!form.end ||
                        Boolean(
                          form.start &&
                            form.end &&
                            Date.parse(wibInputToIso(form.start)) >=
                              Date.parse(wibInputToIso(form.end)),
                        ))
                    }
                    type="datetime-local"
                    value={form.end}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, end: e.target.value }))
                    }
                  />
                </label>
              </div>
              <p className="promo-notice">
                <Info size={17} />
                Semua waktu menggunakan WIB.
              </p>
            </div>
          )}
          {!readonly && step === 2 && (
            <>
              <div className="promo-tools">
                <strong>{form.items.length}/200 produk</strong>
                <button onClick={() => setPicker(true)}>
                  <Plus size={16} />
                  Tambah produk
                </button>
              </div>
              <p className="promo-notice">
                Harga promo harus lebih rendah dari harga normal dan kuota
                sesuai stok SKU.
              </p>
              <button onClick={() => setBulk((v) => !v)} aria-expanded={bulk}>
                Atur massal
              </button>
              {bulk && (
                <div className="promo-panel">
                  <h3>Atur massal</h3>
                  <p className="promo-muted">
                    Nilai terisi akan menimpa input pada scope yang dipilih.
                  </p>
                  <div className="promo-two">
                    <label>
                      Harga promo
                      <input
                        type="number"
                        min="1"
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                      />
                    </label>
                    <label>
                      Kuota
                      <input
                        type="number"
                        min="1"
                        value={bulkQuota}
                        onChange={(e) => setBulkQuota(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Terapkan ke
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="all">Semua SKU peserta</option>
                      <option value="selected">
                        SKU yang dicentang ({checked.size})
                      </option>
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      if (
                        (bulkPrice &&
                          (!Number.isSafeInteger(Number(bulkPrice)) ||
                            Number(bulkPrice) <= 0)) ||
                        (bulkQuota &&
                          (!Number.isSafeInteger(Number(bulkQuota)) ||
                            Number(bulkQuota) <= 0))
                      ) {
                        message("Isi nilai massal berupa bilangan positif.");
                        return;
                      }
                      setForm((f) => ({
                        ...f,
                        items: f.items.map((p) => ({
                          ...p,
                          offers: p.offers.map((o) =>
                            scope === "all" || checked.has(o.variantId)
                              ? {
                                  ...o,
                                  price: bulkPrice || o.price,
                                  quota: bulkQuota || o.quota,
                                }
                              : o,
                          ),
                        })),
                      }));
                    }}
                  >
                    Terapkan nilai
                  </button>
                </div>
              )}
              {form.items.map((p) => (
                <details className="promo-sku-card" open key={p.productId}>
                  <summary>
                    <div className="promo-row">
                      <div className="promo-product">
                        {p.image && (
                          <Image
                            unoptimized
                            width={44}
                            height={48}
                            className="promo-thumb"
                            src={p.image}
                            alt=""
                          />
                        )}
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            Harga normal{" "}
                            {p.variants.length
                              ? formatIDR(
                                  Math.min(
                                    ...p.variants.map((v) => v.regularPrice),
                                  ),
                                )
                              : "—"}
                            {p.variants.length > 1 &&
                            Math.min(
                              ...p.variants.map((v) => v.regularPrice),
                            ) !==
                              Math.max(...p.variants.map((v) => v.regularPrice))
                              ? " – " +
                                formatIDR(
                                  Math.max(
                                    ...p.variants.map((v) => v.regularPrice),
                                  ),
                                )
                              : ""}{" "}
                            · {p.offers.length} SKU
                          </small>
                        </div>
                      </div>
                      <button
                        aria-label={`Hapus ${p.name} dari peserta`}
                        onClick={(e) => {
                          e.preventDefault();
                          setForm((f) => ({
                            ...f,
                            items: f.items.filter(
                              (i) => i.productId !== p.productId,
                            ),
                          }));
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </summary>
                  <div className="promo-product-bulk-fields">
                    {(["price", "quota"] as const).map((key) => (
                      <label key={key}>
                        {key === "price" ? "Harga promo" : "Kuota per SKU"} *
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          aria-label={`${key === "price" ? "Harga promo produk" : "Kuota SKU produk"} ${p.name}`}
                          placeholder={
                            new Set(p.offers.map((o) => o[key])).size > 1
                              ? "Beragam"
                              : "0"
                          }
                          value={
                            new Set(p.offers.map((o) => o[key])).size === 1
                              ? p.offers[0]?.[key] || ""
                              : ""
                          }
                          disabled={!p.offers.length}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              items: f.items.map((item) =>
                                item.productId === p.productId
                                  ? {
                                      ...item,
                                      offers: item.offers.map((o) => ({
                                        ...o,
                                        [key]: e.target.value,
                                      })),
                                    }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <details>
                    <summary>Atur per variasi ({p.variants.length})</summary>
                    {p.variants.map((v) => {
                      const offer = p.offers.find((o) => o.variantId === v.id);
                      return (
                        <div className="promo-sku-fields" key={v.id}>
                          <div className="promo-product">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${v.label} untuk atur massal`}
                              checked={checked.has(v.id)}
                              onChange={() =>
                                setChecked((s) => {
                                  const n = new Set(s);
                                  if (n.has(v.id)) n.delete(v.id);
                                  else n.add(v.id);
                                  return n;
                                })
                              }
                            />
                            <div>
                              <strong>{v.label}</strong>
                              <small>
                                {formatIDR(v.regularPrice)} · stok {v.stock}
                              </small>
                              <label className="promo-inline-check">
                                <input
                                  type="checkbox"
                                  checked={!!offer}
                                  disabled={v.stock < 1 && !offer}
                                  onChange={() =>
                                    setForm((f) => ({
                                      ...f,
                                      items: f.items.map((i) =>
                                        i.productId === p.productId
                                          ? {
                                              ...i,
                                              offers: offer
                                                ? i.offers.filter(
                                                    (o) => o.variantId !== v.id,
                                                  )
                                                : [
                                                    ...i.offers,
                                                    {
                                                      variantId: v.id,
                                                      price: "",
                                                      quota: "",
                                                    },
                                                  ],
                                            }
                                          : i,
                                      ),
                                    }))
                                  }
                                />
                                Ikut promo
                              </label>
                            </div>
                          </div>
                          {offer &&
                            (["price", "quota"] as const).map((key) => (
                              <label key={key}>
                                {key === "price" ? "Harga promo *" : "Kuota *"}
                                <input
                                  aria-label={`${key === "price" ? "Harga promo" : "Kuota"} ${v.sku}`}
                                  id={`promotion-${key}-${v.id}`}
                                  aria-invalid={Boolean(
                                    offerFieldError(
                                      offer[key],
                                      key,
                                      v,
                                      attempted,
                                    ),
                                  )}
                                  aria-describedby={
                                    offerFieldError(
                                      offer[key],
                                      key,
                                      v,
                                      attempted,
                                    )
                                      ? `promotion-${key}-${v.id}-error`
                                      : undefined
                                  }
                                  inputMode="numeric"
                                  type="number"
                                  min="1"
                                  max={
                                    key === "price"
                                      ? v.regularPrice - 1
                                      : v.stock
                                  }
                                  value={offer[key]}
                                  onChange={(e) =>
                                    setForm((f) => ({
                                      ...f,
                                      items: f.items.map((i) =>
                                        i.productId === p.productId
                                          ? {
                                              ...i,
                                              offers: i.offers.map((o) =>
                                                o.variantId === v.id
                                                  ? {
                                                      ...o,
                                                      [key]: e.target.value,
                                                    }
                                                  : o,
                                              ),
                                            }
                                          : i,
                                      ),
                                    }))
                                  }
                                />
                                {offerFieldError(
                                  offer[key],
                                  key,
                                  v,
                                  attempted,
                                ) && (
                                  <span
                                    id={`promotion-${key}-${v.id}-error`}
                                    className="promo-field-error"
                                  >
                                    {offerFieldError(
                                      offer[key],
                                      key,
                                      v,
                                      attempted,
                                    )}
                                  </span>
                                )}
                              </label>
                            ))}
                        </div>
                      );
                    })}
                  </details>
                </details>
              ))}
            </>
          )}
          {(readonly || step === 3) && (
            <div className="promo-panel">
              <h2>{form.name || "Kampanye tanpa nama"}</h2>
              <p>
                {form.start && formatWibDate(wibInputToIso(form.start))} —{" "}
                {form.end && formatWibDate(wibInputToIso(form.end))}
              </p>
              {!readonly && (
                <button onClick={() => router.push(url({ step: "1" }))}>
                  Ubah jadwal
                </button>
              )}
              <h3 className="mt-5">Daftar produk ({form.items.length})</h3>
              {form.items.map((p) => (
                <div className="promo-review-item" key={p.productId}>
                  <div className="promo-product">
                    {p.image && (
                      <Image
                        unoptimized
                        width={44}
                        height={48}
                        className="promo-thumb"
                        src={p.image}
                        alt=""
                      />
                    )}
                    <div>
                      <strong>{p.name}</strong>
                      {p.offers.map((o) => (
                        <p key={o.variantId} className="promo-muted">
                          {p.variants.find((v) => v.id === o.variantId)?.label}{" "}
                          ·{" "}
                          {formatIDR(
                            p.variants.find((v) => v.id === o.variantId)
                              ?.regularPrice ?? 0,
                          )}{" "}
                          → {formatIDR(Number(o.price))} · kuota{" "}
                          {o.quota || "belum diisi"}
                          {"usedCount" in o ? ` · terpakai ${o.usedCount}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {!readonly && (
                <button onClick={() => router.push(url({ step: "2" }))}>
                  Ubah produk dan harga
                </button>
              )}
              <p className="promo-notice">
                Kampanye mulai otomatis sesuai jadwal.
              </p>
            </div>
          )}
        </div>
        {summary}
      </fieldset>
      {!readonly && (
        <footer className="promo-footer">
          {step > 1 && (
            <button
              className="promo-desktop"
              disabled={pending}
              onClick={() => router.push(url({ step: String(step - 1) }))}
            >
              Kembali
            </button>
          )}
          {current?.status !== "SCHEDULED" && (
            <button
              disabled={
                pending ||
                uncertain ||
                (!form.id && !canCreate) ||
                (!!form.id && !canUpdate) ||
                current?.status === "SCHEDULED"
              }
              onClick={() => void save(true)}
            >
              {pendingAction === "draft" ? "Menyimpan…" : "Simpan draf"}
            </button>
          )}
          {step < 3 ? (
            <button
              className="promo-primary"
              disabled={pending}
              onClick={nextStep}
            >
              {step === 1 ? "Pilih produk" : "Tinjau kampanye"}
            </button>
          ) : (
            <button
              className="promo-primary"
              disabled={
                pending ||
                uncertain ||
                (!form.id && !canCreate) ||
                (!!form.id && !canUpdate)
              }
              onClick={() => void save(false)}
            >
              {pendingAction === "schedule"
                ? "Menjadwalkan…"
                : startsImmediately
                  ? "Mulai kampanye"
                  : "Jadwalkan"}
            </button>
          )}
        </footer>
      )}
      {readonly && (
        <PromotionHistory
          entries={history}
          page={historyPage}
          total={historyTotal}
          pageUrl={(page) => url({ "flash-history-page": String(page) })}
        />
      )}
      {readonly && canEdit && (
        <Link className="promo-button" href={url({ view: "edit", step: "1" })}>
          Edit kampanye
        </Link>
      )}
      {picker && (
        <PromotionProductPicker
          canRetire={canUpdate}
          initial={initialProducts}
          selected={form.items}
          categories={categories}
          onCancel={() => setPicker(false)}
          onApply={(items) => {
            setForm((f) => ({ ...f, items }));
            setPicker(false);
          }}
        />
      )}
    </section>
  );
}
