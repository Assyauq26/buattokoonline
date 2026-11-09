"use client";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";

import { useEffect, useRef, useState } from "react";

import { useAppearance } from "@/components/appearance/context";

import { storeChatUrl } from "@/lib/store-contact";

import { useRouter } from "next/navigation";

import { ShoppingBag, Loader2 } from "lucide-react";

import type {
  PurchaseProduct,
  PurchaseVariant,
} from "@/modules/catalog/purchase-options";

import { Button } from "@/components/ui/button";

import { buyNowAction } from "@/modules/checkout/checkout-intent.actions";

import { useProductSelection } from "./product-selection";

import { ProductOptionSelector } from "./product-option-selector";

import { QuantityStepper } from "./quantity-stepper";

import { useProductOptions } from "./use-product-options";

import { useCartInteraction } from "./cart-interaction-provider";

export type VariantOption = PurchaseVariant;

export function PurchasePanel({ product }: { product: PurchaseProduct }) {
  const { config } = useAppearance();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selection = useProductOptions(product),
    context = useProductSelection(),
    interaction = useCartInteraction(),
    router = useRouter();

  const { selected, quantity, image } = selection;

  const setImage = context?.setImage,
    setPrice = context?.setPrice;

  const [error, setError] = useState<string | null>(null),
    [buying, setBuying] = useState(false);

  const root = useRef<HTMLDivElement>(null);

  const missing = product.groups.filter((g) => !selection.options[g.id]);

  const soldOut = product.variants.every((v) => v.available <= 0);

  function validate() {
    if (missing.length) {
      setError(
        `Pilih ${missing.map((g) => g.name.toLocaleLowerCase("id-ID")).join(" dan ")} terlebih dahulu.`,
      );

      const group = root.current?.querySelector<HTMLElement>(
        `[data-option-group="${missing[0].id}"]`,
      );
      group?.scrollIntoView({ block: "center", behavior: "instant" });
      group
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus({ preventScroll: true });
      group?.classList.add("purchase-needs-choice");
      setTimeout(() => group?.classList.remove("purchase-needs-choice"), 1800);
      return false;
    }

    if (!selected || selected.available < quantity) {
      setError(
        soldOut || selected?.available === 0
          ? "Stok habis"
          : "Kombinasi variasi tidak tersedia.",
      );
      return false;
    }
    return true;
  }

  const lock = useRef(false),
    pending = buying || Boolean(interaction?.busy),
    stock = selected?.available ?? 0;

  const galleryImage = image?.url === product.image?.url ? null : image;

  useEffect(() => setImage?.(galleryImage), [galleryImage, setImage]);

  useEffect(
    () =>
      setPrice?.(
        selected
          ? { unit: selected.price, original: selected.originalPrice }
          : null,
      ),

    [selected, setPrice],
  );

  async function buy() {
    if (lock.current || !validate() || !selected) return;

    lock.current = true;

    setBuying(true);

    setError(null);

    try {
      const result = await buyNowAction(selected.id, quantity);

      if (!result.ok || !result.data) {
        setError(result.error ?? "Gagal menyiapkan checkout");

        return;
      }

      router.push(result.data.checkoutUrl);
    } catch {
      setError("Koneksi terputus. Silakan coba lagi.");
    } finally {
      lock.current = false;

      setBuying(false);
    }
  }

  const variants = product.groups
    .map((g) => g.values.find((v) => v.id === selection.options[g.id])?.value)
    .filter((v): v is string => !!v);

  const chat =
    mounted && config.identity.showWhatsApp
      ? storeChatUrl(config.identity.whatsapp, product, quantity, variants)
      : null;

  return (
    <div ref={root} className="space-y-5" data-testid="purchase-panel">
      <ProductOptionSelector
        product={product}

        options={selection.options}

        busy={pending}

        onChange={(next) => {
          selection.setOptions(next);

          setError(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Jumlah</span>

        <QuantityStepper
          value={quantity}

          max={stock}

          busy={pending}

          onChange={selection.setQuantity}
        />

        <span className="text-xs" aria-live="polite">
          {!selected
            ? "Pilih variasi terlebih dahulu"
            : stock <= 0
              ? "Stok habis"
              : `${stock} tersedia`}
        </span>
      </div>

      {selection.notice && (
        <p role="status" className="text-xs">
          {selection.notice}
        </p>
      )}

      {selected?.sku && (
        <p className="text-xs" data-testid="selected-sku">
          SKU: {selected.sku}
        </p>
      )}

      {error && (
        <p
          role="alert"

          className="text-sm text-destructive"

          data-testid="purchase-error"
        >
          {error}
        </p>
      )}

      <div className="pdp-purchase-actions" aria-label="Aksi pembelian produk">
        {chat && (
          <a
            className="pdp-whatsapp"
            href={chat}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat toko melalui WhatsApp"
          >
            <WhatsAppIcon />
            <span className="sr-only">Chat Toko</span>
          </a>
        )}

        <button
          type="button"

          data-button-variant="outline"

          className="pdp-cart-pill"

          data-testid="add-to-cart-btn"

          aria-label="Tambah ke keranjang"

          disabled={pending || !interaction}

          aria-disabled={pending || !selected || stock < quantity}

          data-incomplete={!selected || stock < quantity}

          onClick={(e) => {
            if (validate() && selected)
              void interaction?.add(
                product,
                selected.id,
                quantity,
                e.currentTarget,
              );
          }}
        >
          {pending ? (
            <Loader2
              size={23}

              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <ShoppingBag size={23} />
          )}

          <span>
            {pending ? "Menambahkan…" : soldOut ? "Stok habis" : "Tambah"}
          </span>
        </button>

        <button
          type="button"

          data-button-variant="default"

          className="pdp-buy-pill"

          data-testid="buy-now-btn"

          disabled={pending}

          aria-disabled={pending || !selected || stock < quantity}

          data-incomplete={!selected || stock < quantity}

          onClick={() => void buy()}
        >
          {pending ? "Memproses…" : "Beli Sekarang"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed">
        Beli Sekarang hanya membeli pilihan ini. Isi keranjang Anda tetap
        tersimpan.
      </p>
    </div>
  );
}
