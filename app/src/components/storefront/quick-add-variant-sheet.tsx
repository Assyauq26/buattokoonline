"use client";
import Image from "next/image";
import { useRef, useState, useId } from "react";
import { useAppearance } from "@/components/appearance/context";
import { Button } from "@/components/ui/button";
import { formatIDR, discountPercent } from "@/lib/money";
import type { PurchaseProduct } from "@/modules/catalog/purchase-options";
import { ProductOptionSelector } from "./product-option-selector";
import { QuantityStepper } from "./quantity-stepper";
import { useProductOptions } from "./use-product-options";
export function QuickAddVariantSheet({
  product,
  busy,
  error,
  uncertain,
  onSubmit,
  onCart,
  initialOptions,
  initialQuantity,
}: {
  product: PurchaseProduct;
  initialOptions?: Record<string, string>;
  initialQuantity?: number;
  busy: boolean;
  error: string | null;
  uncertain: boolean;
  onSubmit: (variantId: string, quantity: number) => void;
  onCart: () => void;
}) {
  const { config } = useAppearance();
  const root = useRef<HTMLDivElement>(null),
    [validation, setValidation] = useState("");
  const feedbackId = useId();
  const selection = useProductOptions(product, initialOptions, initialQuantity),
    { selected, image, quantity } = selection;
  const prices = product.variants.map((v) => v.price),
    min = Math.min(...prices),
    max = Math.max(...prices);
  const percent = selected
    ? discountPercent(selected.originalPrice, selected.price)
    : 0;
  const allSoldOut = product.variants.every((v) => v.available <= 0);
  const missing = product.groups.filter((g) => !selection.options[g.id]);
  const hint = allSoldOut
    ? "Stok habis"
    : missing.length
      ? `Pilih ${missing.map((g) => g.name.toLocaleLowerCase("id-ID")).join(" dan ")} terlebih dahulu.`
      : !selected
        ? "Kombinasi variasi tidak tersedia."
        : selected.available < quantity
          ? "Stok habis"
          : "";
  return (
    <div
      ref={root}
      data-testid="quick-add-variant-sheet"
      className="flex min-h-0 flex-col"
    >
      <div className="purchase-sheet-scroll space-y-6">
        <div className="flex gap-4 pr-6">
          <div className="purchase-thumbnail">
            {image ? (
              <Image
                src={image.url}
                alt={image.alt || product.name}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized={image.url.startsWith("/api/v1/product-images/")}
              />
            ) : (
              <span>Tanpa foto</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-1 truncate text-xs">
              {product.brand ?? config.identity.name}
            </p>
            <h3 className="line-clamp-2 break-words text-base font-semibold">
              {product.name}
            </h3>
            <p
              className="mt-2 font-display text-lg font-bold"
              data-testid="quick-add-price"
              data-theme-role="price"
              data-discount={percent > 0}
            >
              {selected
                ? formatIDR(selected.price)
                : prices.length
                  ? `${formatIDR(min)}${max > min ? ` – ${formatIDR(max)}` : ""}`
                  : "Tidak tersedia"}
            </p>
            {percent > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <s className="text-xs text-ink-muted">
                  {formatIDR(selected!.originalPrice)}
                </s>
                <span
                  data-badge-variant="sale"
                  className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white"
                >
                  {percent}% OFF
                </span>
              </div>
            )}
          </div>
        </div>
        <ProductOptionSelector
          product={product}
          options={selection.options}
          onChange={(v) => {
            selection.setOptions(v);
            setValidation("");
          }}
          busy={busy}
        />
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            max={selected?.available ?? 0}
            busy={busy}
            onChange={selection.setQuantity}
          />
          <p className="text-sm" aria-live="polite">
            {selected
              ? `${selected.available} tersedia`
              : "Pilih variasi terlebih dahulu"}
          </p>
        </div>
        {selected?.sku && (
          <p className="text-xs" data-testid="quick-add-sku">
            SKU: {selected.sku}
          </p>
        )}
        {selection.notice && (
          <p role="status" className="text-xs">
            {selection.notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="purchase-sheet-footer">
        <p
          id={feedbackId}
          role="status"
          aria-live="polite"
          className="mb-3 text-sm"
        >
          {validation || hint}
        </p>
        <Button
          className="purchase-submit w-full"
          disabled={busy}
          aria-disabled={busy || (!uncertain && !!hint)}
          aria-describedby={feedbackId}
          data-incomplete={!uncertain && !!hint}
          onClick={() => {
            if (busy) return;
            if (uncertain) {
              onCart();
              return;
            }
            if (hint) {
              setValidation(hint);
              const group = root.current?.querySelector<HTMLElement>(
                `[data-option-group="${missing[0]?.id}"]`,
              );
              group?.scrollIntoView({ block: "nearest", behavior: "instant" });
              group
                ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                ?.focus();
              return;
            }
            if (selected) onSubmit(selected.id, quantity);
          }}
        >
          {busy
            ? "Menambahkan…"
            : uncertain
              ? "Periksa Keranjang"
              : allSoldOut || selected?.available === 0
                ? "Stok habis"
                : "Masukkan ke Keranjang"}
        </Button>
      </div>
    </div>
  );
}
