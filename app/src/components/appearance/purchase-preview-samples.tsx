"use client";
import { QuickAddVariantSheet } from "@/components/storefront/quick-add-variant-sheet";
import { CartSuccessSheet } from "@/components/storefront/cart-success-sheet";
import type { PurchaseProduct } from "@/modules/catalog/purchase-options";
// Like the existing four preview cards, these are explicitly synthetic and
// have no API, cart, checkout or navigation handlers inside the private iframe.
const sample: PurchaseProduct = {
  id: "preview-purchase",
  slug: "preview-purchase",
  name: "Everyday Tee",
  brand: "Preview",
  image: null,
  groups: [
    {
      id: "preview-fit",
      name: "Model",
      allowsImage: true,
      values: [
        { id: "preview-regular", value: "Regular", image: null },
        { id: "preview-relaxed", value: "Relaxed", image: null },
      ],
    },
  ],
  variants: [
    {
      id: "preview-regular-sku",
      sku: "PREVIEW-REGULAR",
      color: null,
      size: null,
      available: 5,
      price: 149000,
      originalPrice: 199000,
      optionValueIds: ["preview-regular"],
    },
    {
      id: "preview-relaxed-sku",
      sku: "PREVIEW-RELAXED",
      color: null,
      size: null,
      available: 2,
      price: 149000,
      originalPrice: 199000,
      optionValueIds: ["preview-relaxed"],
    },
  ],
};
export function PurchasePreviewSamples() {
  return (
    <div className="space-y-8">
      <section
        className="purchase-preview space-y-5"
        data-testid="preview-purchase-options"
      >
        <h2 className="text-lg font-semibold">Pilihan produk — simulasi</h2>
        <QuickAddVariantSheet
          product={sample}
          busy={false}
          error={null}
          uncertain={false}
          onSubmit={() => {}}
          onCart={() => {}}
        />
      </section>
      <section
        className="purchase-preview"
        data-testid="preview-purchase-success"
      >
        <CartSuccessSheet
          item={{
            name: sample.name,
            image: null,
            variantLabel: "Model: Regular",
            quantity: 1,
            unitPrice: 149000,
          }}
          onContinue={() => {}}
          onCart={() => {}}
        />
      </section>
    </div>
  );
}
