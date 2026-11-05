"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bolt, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatIDR, discountPercent } from "@/lib/money";
import { formatWibDate } from "@/modules/promotions/marketing-display";
import {
  campaignState,
  isoToWibInput,
  wibInputToIso,
} from "@/modules/promotions/campaign.validation";
import {
  campaignProductsAction,
  endCampaignAction,
  saveCampaignAction,
  retireLegacyAction,
} from "@/modules/promotions/campaign.actions";
type Candidate = {
  id: string;
  name: string;
  regularPrice: number;
  image: string | null;
  updatedAt: string;
  legacy: boolean;
  reason: string | null;
};
export type CampaignEditorRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  startsAt: string;
  endsAt: string;
  items: {
    productId: string;
    flashSalePrice: number;
    product: {
      name: string;
      basePrice: number;
      salePrice: number | null;
      status: string;
      regularPrice?: number;
      eligibilityWarning?: string | null;
    };
  }[];
};
type Selection = {
  productId: string;
  name: string;
  regularPrice: number;
  price: string;
  legacy: boolean;
};
const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  UPCOMING: "Terjadwal",
  ACTIVE: "Berlangsung",
  ENDED: "Selesai",
  CANCELLED: "Dibatalkan",
};
export function FlashCampaignManager({
  campaigns,
  initialProducts,
  categories,
  history,
  canCreate,
  canUpdate,
  serverNow,
}: {
  campaigns: CampaignEditorRow[];
  initialProducts: { items: Candidate[]; page: number; total: number };
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
}) {
  const router = useRouter();
  const busy = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<CampaignEditorRow | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<Selection[]>([]);
  const [resolveLegacy, setResolveLegacy] = useState(false);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const dirty = Boolean(name || start || end || selected.length);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function message(text: string, error = true) {
    setFeedback({ text, error });
    if (error) requestAnimationFrame(() => notice.current?.focus());
  }
  function reset() {
    setEditing(null);
    setName("");
    setStart("");
    setEnd("");
    setSelected([]);
    setResolveLegacy(false);
  }
  function edit(c: CampaignEditorRow) {
    if (dirty && !window.confirm("Ganti draft yang belum disimpan?")) return;
    setEditing(c);
    setName(c.name);
    setStart(isoToWibInput(c.startsAt));
    setEnd(isoToWibInput(c.endsAt));
    setSelected(
      c.items.map((i) => ({
        productId: i.productId,
        name: i.product.name,
        regularPrice:
          i.product.regularPrice ?? i.product.salePrice ?? i.product.basePrice,
        price: String(i.flashSalePrice),
        legacy: false,
      })),
    );
    setResolveLegacy(false);
    document.getElementById("campaign-name")?.focus();
  }
  async function search(page = 1) {
    if (searching) return;
    setSearching(true);
    try {
      const r = await campaignProductsAction({
        search: query,
        categoryId: category || undefined,
        page,
      });
      if (r.ok && r.data) setProducts(r.data);
      else message(r.error ?? "Produk gagal dimuat.");
    } catch {
      message("Koneksi terputus. Coba pencarian kembali.");
    } finally {
      setSearching(false);
    }
  }
  useEffect(() => setProducts(initialProducts), [initialProducts]);
  async function retire(p: Candidate) {
    if (
      busy.current ||
      !window.confirm(
        `Hentikan promo lama ${p.name}? Nilai asli tetap diarsipkan; diskon Flash Sale manual kembali ke harga normal.`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    try {
      const r = await retireLegacyAction({
        productId: p.id,
        expectedUpdatedAt: p.updatedAt,
      });
      if (!r.ok) message(r.error ?? "Konversi gagal.");
      else {
        setSelected((rows) => rows.filter((i) => i.productId !== p.id));
        message("Promo legacy diakhiri dan diarsipkan.", false);
        router.refresh();
      }
    } catch {
      message("Koneksi terputus.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function toggle(p: Candidate) {
    setSelected((rows) =>
      rows.some((i) => i.productId === p.id)
        ? rows.filter((i) => i.productId !== p.id)
        : [
            ...rows,
            {
              productId: p.id,
              name: p.name,
              regularPrice: p.regularPrice,
              price: "",
              legacy: p.legacy,
            },
          ],
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status = submitter?.value === "SCHEDULED" ? "SCHEDULED" : "DRAFT";
    if (
      (status === "SCHEDULED" || editing?.status === "SCHEDULED") &&
      !window.confirm(
        `Jadwalkan ${selected.length} produk dengan satu periode WIB ini? Harga hanya berlaku pada periode kampanye.`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const r = await saveCampaignAction({
        id: editing?.id ?? null,
        expectedVersion: editing?.version ?? 0,
        name,
        status,
        startsAt: wibInputToIso(start),
        endsAt: wibInputToIso(end),
        resolveLegacy,
        items: selected.map((p) => ({
          productId: p.productId,
          flashSalePrice: Number(p.price),
        })),
      });
      if (!r.ok) {
        message(r.error ?? "Kampanye gagal disimpan.");
        return;
      }
      reset();
      message("Kampanye tersimpan. Harga tetap divalidasi server.", false);
      router.refresh();
    } catch (e) {
      message(
        e instanceof Error ? e.message : "Koneksi terputus. Coba kembali.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function finish(c: CampaignEditorRow) {
    if (
      busy.current ||
      !window.confirm(
        `Akhiri/batalkan ${c.name}? Pesanan yang sudah dibuat tetap memakai snapshot harganya.`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    try {
      const r = await endCampaignAction({
        id: c.id,
        expectedVersion: c.version,
      });
      if (!r.ok) message(r.error ?? "Kampanye gagal diakhiri.");
      else {
        message("Kampanye diakhiri.", false);
        router.refresh();
      }
    } catch {
      message("Koneksi terputus. Coba kembali.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const editable = editing ? canUpdate : canCreate;
  const currentCampaigns = campaigns.filter((c) =>
    ["DRAFT", "UPCOMING", "ACTIVE"].includes(campaignState(c, serverNow)),
  );
  const pastCampaigns = campaigns.filter((c) => !currentCampaigns.includes(c));
  return (
    <section
      id="flash-sale"
      className="scroll-mt-24 space-y-5"
      data-testid="flash-campaign-manager"
    >
      <header className="flex items-start gap-3">
        <Bolt size={23} className="mt-1 shrink-0" />
        <div>
          <h2 className="text-xl font-bold">Flash Sale</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Satu kampanye, satu jadwal WIB, banyak produk. Diskon reguler tetap
            tersimpan.
          </p>
        </div>
      </header>
      {feedback && (
        <div
          ref={notice}
          tabIndex={-1}
          role={feedback.error ? "alert" : "status"}
          className={`rounded-xl border p-3 text-sm ${feedback.error ? "border-destructive text-destructive" : "border-line"}`}
        >
          {feedback.text}
        </div>
      )}
      {(canCreate || canUpdate) && (
        <form
          onSubmit={save}
          className="rounded-2xl border border-line bg-white"
          aria-label="Editor kampanye Flash Sale"
        >
          <fieldset
            disabled={pending || !editable}
            className="min-w-0 space-y-5 p-4 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">
                {editing ? "Edit kampanye" : "Kampanye baru"}
              </h3>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (!dirty || window.confirm("Batalkan perubahan draft?"))
                      reset();
                  }}
                >
                  Batalkan edit
                </Button>
              )}
            </div>
            <div>
              <Label htmlFor="campaign-name">Nama kampanye</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign-start">Mulai (WIB / UTC+07)</Label>
                <Input
                  id="campaign-start"
                  type="datetime-local"
                  step={1}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="campaign-end">Berakhir (WIB / UTC+07)</Label>
                <Input
                  id="campaign-end"
                  type="datetime-local"
                  step={1}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-3 border-t border-line pt-5">
              <h4 className="font-semibold">Pilih produk</h4>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                <div>
                  <Label htmlFor="campaign-search">Cari produk</Label>
                  <Input
                    id="campaign-search"
                    value={query}
                    maxLength={160}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void search();
                      }
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="campaign-category">Kategori</Label>
                  <select
                    id="campaign-category"
                    className="h-11 w-full rounded-xl border border-line bg-white px-2 text-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Semua kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  className="self-end"
                  disabled={searching}
                  onClick={() => void search()}
                >
                  <Search size={16} />
                  Cari
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {products.total} hasil · halaman {products.page}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setSelected((rows) => {
                      const known = new Set(rows.map((r) => r.productId));
                      return [
                        ...rows,
                        ...products.items
                          .filter((p) => !p.reason && !known.has(p.id))
                          .map((p) => ({
                            productId: p.id,
                            name: p.name,
                            regularPrice: p.regularPrice,
                            price: "",
                            legacy: p.legacy,
                          })),
                      ].slice(0, 200);
                    })
                  }
                >
                  Pilih produk eligible di halaman ini
                </Button>
              </div>
              <ul className="divide-y divide-line">
                {products.items.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-16 items-center gap-3 py-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-black"
                        disabled={
                          Boolean(p.reason) ||
                          (!selected.some((i) => i.productId === p.id) &&
                            selected.length >= 200)
                        }
                        checked={selected.some((i) => i.productId === p.id)}
                        onChange={() => toggle(p)}
                      />
                      {p.image && (
                        <Image
                          unoptimized
                          src={p.image}
                          alt=""
                          width={44}
                          height={44}
                          className="h-11 w-11 rounded-lg object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1 break-words text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-xs text-ink-soft">
                          {formatIDR(p.regularPrice)}
                          {p.legacy ? " · perlu konversi legacy" : ""}
                          {p.reason ? ` · ${p.reason}` : ""}
                        </span>
                      </span>
                    </label>
                    {p.legacy && canUpdate && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mb-3"
                        onClick={() => void retire(p)}
                      >
                        Hentikan promo lama {p.name}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {!products.items.length && (
                <p className="py-4 text-sm text-ink-soft">
                  Tidak ada produk sesuai pencarian.
                </p>
              )}
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={searching || products.page === 1}
                  onClick={() => void search(products.page - 1)}
                >
                  Sebelumnya
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={searching || products.page * 20 >= products.total}
                  onClick={() => void search(products.page + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
            <div className="space-y-3 border-t border-line pt-5">
              <h4 className="font-semibold">
                Harga peserta · {selected.length}/200 produk
              </h4>
              {!selected.length && (
                <p className="text-sm text-ink-soft">
                  Pilih produk lalu isi harga promo masing-masing.
                </p>
              )}
              {selected.map((p) => (
                <div
                  key={p.productId}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-start gap-2 border-b border-line pb-4 sm:grid-cols-[minmax(0,1fr)_180px_44px]"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-ink-soft">
                      Reguler {formatIDR(p.regularPrice)}
                      {Number(p.price) > 0
                        ? ` → ${formatIDR(Number(p.price))} (${discountPercent(p.regularPrice, Number(p.price))}%)`
                        : ""}
                    </p>
                  </div>
                  <div className="col-start-1 sm:col-start-auto">
                    <Label htmlFor={`campaign-price-${p.productId}`}>
                      Harga Flash Sale (Rp)
                    </Label>
                    <Input
                      id={`campaign-price-${p.productId}`}
                      type="number"
                      min={1}
                      max={p.regularPrice - 1}
                      required
                      value={p.price}
                      onChange={(e) =>
                        setSelected((rows) =>
                          rows.map((r) =>
                            r.productId === p.productId
                              ? { ...r, price: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="col-start-2 row-start-1 h-11 w-11 p-0 sm:col-start-3"
                    aria-label={`Hapus ${p.name} dari peserta`}
                    onClick={() =>
                      setSelected((rows) =>
                        rows.filter((r) => r.productId !== p.productId),
                      )
                    }
                  >
                    <X size={18} />
                  </Button>
                </div>
              ))}
            </div>
            {selected.some((p) => p.legacy) && (
              <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  checked={resolveLegacy}
                  onChange={(e) => setResolveLegacy(e.target.checked)}
                />
                <span>
                  Saya menyetujui konversi promo legacy peserta ke satu periode
                  di atas. Nilai lama tetap diarsipkan. Konversi hanya melalui
                  aksi Jadwalkan.
                </span>
              </label>
            )}
          </fieldset>
          <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-b-2xl border-t border-line bg-white p-4 shadow-sm">
            <Button
              type="submit"
              value="DRAFT"
              variant="outline"
              disabled={
                pending ||
                !editable ||
                !selected.length ||
                selected.some((p) => p.legacy)
              }
            >
              Simpan Draft
            </Button>
            <Button
              type="submit"
              value="SCHEDULED"
              disabled={
                pending ||
                !editable ||
                !selected.length ||
                (selected.some((p) => p.legacy) && !resolveLegacy)
              }
            >
              {pending ? "Menyimpan…" : "Jadwalkan"}
            </Button>
          </div>
        </form>
      )}
      <div className="space-y-3">
        <h3 className="font-semibold">Kampanye &amp; riwayat</h3>
        {!campaigns.length && (
          <p className="rounded-xl border border-line p-5 text-sm text-ink-soft">
            Belum ada kampanye. Mulai dengan memilih produk dan satu periode.
          </p>
        )}
        {currentCampaigns.map((c) => (
          <article
            key={c.id}
            className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-4"
          >
            <div className="min-w-0 flex-1">
              <h4 className="break-words font-semibold">{c.name}</h4>
              <p className="mt-1 text-sm">
                {statusLabel[campaignState(c, serverNow)]} · {c.items.length}{" "}
                produk
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {formatWibDate(c.startsAt)} — {formatWibDate(c.endsAt)} · revisi{" "}
                {c.version}
              </p>
              {c.items.some((i) => i.product.eligibilityWarning) && (
                <p className="mt-2 text-sm" role="status">
                  {c.items.filter((i) => i.product.eligibilityWarning).length}{" "}
                  produk tidak memenuhi syarat dan tidak ditawarkan. Periksa
                  peserta melalui Edit.
                </p>
              )}
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                {c.items.slice(0, 5).map((i) => (
                  <li key={i.productId}>
                    {i.product.name} · {formatIDR(i.flashSalePrice)}
                    {i.product.eligibilityWarning
                      ? ` · ${i.product.eligibilityWarning}`
                      : ""}
                  </li>
                ))}
              </ul>
              {c.items.length > 5 && (
                <p className="mt-1 text-xs text-ink-soft">
                  Dan {c.items.length - 5} produk lainnya. Lihat peserta lengkap
                  melalui Edit.
                </p>
              )}
            </div>
            {canUpdate &&
              ["DRAFT", "SCHEDULED"].includes(c.status) &&
              (c.status === "DRAFT" || Date.parse(c.endsAt) > serverNow) && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => edit(c)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void finish(c)}
                  >
                    Akhiri
                  </Button>
                </div>
              )}
          </article>
        ))}
      </div>
      {pastCampaigns.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Kampanye selesai / dibatalkan ({pastCampaigns.length})
          </summary>
          <ul className="mt-3 space-y-3 text-sm">
            {pastCampaigns.map((c) => (
              <li key={c.id}>
                <p>
                  {c.name} · {statusLabel[campaignState(c, serverNow)]} ·{" "}
                  {c.items.length} produk
                </p>
                <p className="text-xs text-ink-soft">
                  {formatWibDate(c.startsAt)} — {formatWibDate(c.endsAt)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {history.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Riwayat perubahan kampanye
          </summary>
          <ol className="mt-3 space-y-3 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <p>
                  {campaigns.find((c) => c.id === h.entityId)?.name ??
                    "Kampanye"}{" "}
                  ·{" "}
                  {h.action === "flash-campaign.create"
                    ? "Dibuat"
                    : h.action === "flash-campaign.update"
                      ? "Diperbarui"
                      : "Diakhiri"}
                </p>
                <time className="text-xs text-ink-soft" dateTime={h.createdAt}>
                  {formatWibDate(h.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
