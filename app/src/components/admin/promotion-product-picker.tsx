"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  campaignProductsAction,
  retireLegacyAction,
} from "@/modules/promotions/campaign.actions";
import { PromotionDialog } from "./promotion-dialog";
import type { PromotionProduct, ProductDraft } from "./promotion-domain";
import { formatIDR } from "@/lib/money";
export function PromotionProductPicker({
  initial,
  selected,
  categories,
  onCancel,
  onApply,
  canRetire,
}: {
  initial: { items: PromotionProduct[]; page: number; total: number };
  selected: ProductDraft[];
  categories: { id: string; name: string }[];
  onCancel: () => void;
  onApply: (items: ProductDraft[]) => void;
  canRetire: boolean;
}) {
  const [data, setData] = useState(initial),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState(
    () => new Map(selected.map((p) => [p.productId, p])),
  );
  const sequence = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement),
  );
  const retiring = useRef(false);
  async function retire(p: PromotionProduct) {
    if (
      retiring.current ||
      !window.confirm(
        `Hentikan promo lama ${p.name}? Harga kembali ke harga reguler; nilai lama tetap diarsipkan.`,
      )
    )
      return;
    retiring.current = true;
    setBusy(true);
    try {
      const result = await retireLegacyAction({
        productId: p.id,
        expectedUpdatedAt: p.updatedAt,
      });
      if (!result.ok) setError(result.error || "Promo lama gagal diakhiri.");
      else setRetry((r) => r + 1);
    } catch {
      setError(
        "Hasil perubahan belum pasti. Muat ulang produk sebelum mencoba lagi.",
      );
    } finally {
      retiring.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const id = ++sequence.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const r = await campaignProductsAction({
          search,
          categoryId: category || undefined,
          page,
        });
        if (active && id === sequence.current) {
          if (r.ok && r.data) setData(r.data);
          else setError(r.error || "Produk gagal dimuat.");
        }
      } catch {
        if (active) setError("Koneksi terputus. Coba kembali.");
      } finally {
        if (active) setBusy(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, category, page, retry]);
  const add = (p: PromotionProduct, map: Map<string, ProductDraft>) => {
    if (p.reason || p.legacy || map.size >= 200) return;
    map.set(p.id, {
      productId: p.id,
      name: p.name,
      image: p.image,
      legacy: p.legacy,
      variants: p.variants,
      offers: p.variants
        .filter((v) => v.stock > 0)
        .map((v) => ({ variantId: v.id, price: "", quota: "" })),
    });
  };
  return (
    <PromotionDialog
      title="Pilih produk"
      description="Pilih produk yang sudah terbit dan memiliki stok. Maksimal 200 produk."
      onClose={onCancel}
      onReturnFocus={() => returnFocus.current?.focus()}
      footer={
        <>
          <span>{picked.size}/200 produk dipilih</span>
          <div className="promo-actions">
            <button onClick={onCancel}>Batal</button>
            <button
              className="promo-primary"
              onClick={() => onApply([...picked.values()])}
            >
              Tambahkan produk
            </button>
          </div>
        </>
      }
    >
      <div className="promo-tools">
        <input
          aria-label="Cari produk"
          placeholder="Cari produk"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Kategori produk"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div role="alert">
          {error}
          <button onClick={() => setRetry((p) => p + 1)}>Coba lagi</button>
        </div>
      )}
      <button
        onClick={() =>
          setPicked((current) => {
            const next = new Map(current);
            for (const p of data.items) add(p, next);
            return next;
          })
        }
      >
        Pilih semua yang tersedia pada halaman ini
      </button>
      <div aria-busy={busy}>
        {busy && <p role="status">Memuat produk…</p>}
        {!busy && !data.items.length && (
          <p className="promo-empty">Produk tidak ditemukan.</p>
        )}
        {data.items.map((p) => (
          <label className="promo-choice" key={p.id}>
            <input
              type="checkbox"
              checked={picked.has(p.id)}
              disabled={
                !!p.reason ||
                p.legacy ||
                (!picked.has(p.id) && picked.size >= 200)
              }
              onChange={() =>
                setPicked((current) => {
                  const next = new Map(current);
                  if (next.has(p.id)) next.delete(p.id);
                  else add(p, next);
                  return next;
                })
              }
            />
            {p.image ? (
              <Image
                unoptimized
                width={44}
                height={48}
                className="promo-thumb"
                src={p.image}
                alt=""
              />
            ) : (
              <div className="promo-thumb" />
            )}
            <div>
              <strong>{p.name}</strong>
              <small>
                {p.reason ||
                  (p.legacy
                    ? "Promo lama perlu diselesaikan sebelum dipilih."
                    : `${p.variants.length} SKU · ${formatIDR(p.regularPrice)}`)}
              </small>
              {p.legacy && canRetire && (
                <button
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    void retire(p);
                  }}
                >
                  Hentikan promo lama
                </button>
              )}
              {selected.some((i) => i.productId === p.id) && (
                <small>Sudah ditambahkan</small>
              )}
            </div>
          </label>
        ))}
      </div>
      <div className="promo-pagination">
        <button
          disabled={page === 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          Sebelumnya
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(data.total / 20))}
        </span>
        <button
          disabled={page * 20 >= data.total || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          Berikutnya
        </button>
      </div>
    </PromotionDialog>
  );
}
