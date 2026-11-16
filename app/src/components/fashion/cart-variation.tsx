"use client";
import { useEffect, useState } from "react";
import type { PurchaseProduct } from "@/modules/catalog/purchase-options";
import { formatIDR } from "@/lib/money";
export function CartVariation({
  slug,
  current,
  quantity,
  busy,
  onChange,
}: {
  slug: string;
  current: string;
  quantity: number;
  busy: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [product, setProduct] = useState<PurchaseProduct | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setProduct(null);
    setError("");
    void fetch("/api/v1/products/" + encodeURIComponent(slug) + "/purchase", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const result = await r.json();
        if (!result.success) throw Error();
        if (!controller.signal.aborted) setProduct(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Variasi tidak dapat dimuat.");
      });
    return () => controller.abort();
  }, [open, slug]);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        aria-expanded={open}
        className="min-h-10 text-sm underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "Tutup" : "Ubah variasi"}
      </button>
      {open &&
        (error ? (
          <p role="alert">{error}</p>
        ) : product ? (
          <label className="block text-sm">
            Variasi
            <select
              className="block max-w-full p-2"
              value={current}
              disabled={busy}
              onChange={(e) => {
                onChange(e.target.value);
                setOpen(false);
              }}
            >
              {product.variants.map((v) => (
                <option
                  key={v.id}
                  value={v.id}
                  disabled={v.available < quantity}
                >
                  {product.groups
                    .flatMap((g) =>
                      g.values
                        .filter((x) => v.optionValueIds.includes(x.id))
                        .map((x) => x.value),
                    )
                    .join(" / ") ||
                    v.sku ||
                    "Standar"}{" "}
                  · {formatIDR(v.price)}
                  {v.available < quantity ? " · Stok tidak cukup" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p role="status">Memuat variasi…</p>
        ))}
    </div>
  );
}
