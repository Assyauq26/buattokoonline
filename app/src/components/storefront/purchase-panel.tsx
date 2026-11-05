"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Loader2, BellRing, Check } from "lucide-react";
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
  const selection = useProductOptions(product),
    context = useProductSelection(),
    interaction = useCartInteraction(),
    router = useRouter();
  const { selected, quantity, image } = selection;
  const setImage = context?.setImage,
    setPrice = context?.setPrice;
  const [error, setError] = useState<string | null>(null),
    [buying, setBuying] = useState(false),
    [notified, setNotified] = useState(false);
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
    if (!selected || selected.available < quantity || lock.current) return;
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
  return (
    <div className="space-y-5" data-testid="purchase-panel">
      <ProductOptionSelector
        product={product}
        options={selection.options}
        busy={pending}
        onChange={(next) => {
          selection.setOptions(next);
          setError(null);
          setNotified(false);
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
      {selected && stock <= 0 && (
        <Button
          type="button"
          variant="outline"
          data-testid="notify-me-btn"
          disabled={notified}
          onClick={() => setNotified(true)}
        >
          {notified ? (
            <>
              <Check size={16} />
              Akan diberi tahu
            </>
          ) : (
            <>
              <BellRing size={16} />
              Beri Tahu Saya
            </>
          )}
        </Button>
      )}
      <div className="pdp-purchase-actions" aria-label="Aksi pembelian produk">
        <button
          type="button"
          data-button-variant="outline"
          className="pdp-cart-pill"
          data-testid="add-to-cart-btn"
          aria-label="Tambah ke keranjang"
          disabled={pending || !selected || stock < quantity || !interaction}
          onClick={(e) =>
            selected &&
            void interaction?.add(
              product,
              selected.id,
              quantity,
              e.currentTarget,
            )
          }
        >
          {pending ? (
            <Loader2
              size={23}
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <ShoppingBag size={23} />
          )}
          <span className="sr-only">Tambah ke keranjang</span>
        </button>
        <button
          type="button"
          data-button-variant="default"
          className="pdp-buy-pill"
          data-testid="buy-now-btn"
          disabled={pending || !selected || stock < quantity}
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
