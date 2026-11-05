"use client";
import { useEffect, useState } from "react";
import { AppearanceProvider, StoreLogo } from "./context";
import { StorefrontHeader } from "@/components/storefront/header";
import { PurchasePreviewSamples } from "./purchase-preview-samples";
import { BottomNav } from "@/components/storefront/bottom-nav";
import { ProductCard } from "@/components/storefront/product-card";
import { Button } from "@/components/ui/button";
import {
  makeDefault,
  parseAppearance,
  type StoreAppearanceV1,
} from "@/modules/appearance/schema";
import { isLegacy, themeStyle } from "@/modules/appearance/runtime";
export function AppearancePreview() {
  const [config, setConfig] = useState<StoreAppearanceV1>(makeDefault()),
    [logo, setLogo] = useState<string>();
  useEffect(() => {
    const nonce = location.hash.slice(1),
      origin = new URL(location.href).origin;
    let blobUrl: string | undefined;
    let blobId: string | null = null;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== parent ||
        event.origin !== origin ||
        event.data?.nonce !== nonce ||
        event.data?.type !== "appearance"
      )
        return;
      try {
        const v = parseAppearance(event.data.config);
        setConfig(v);
        if (v.identity.logoAssetId !== blobId) {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          blobUrl = undefined;
          blobId = v.identity.logoAssetId;
        }
        if (
          !blobUrl &&
          event.data.logo instanceof ArrayBuffer &&
          event.data.logo.byteLength <= 2097152
        ) {
          blobUrl = URL.createObjectURL(
            new Blob([event.data.logo], { type: "image/webp" }),
          );
        }
        setLogo(blobUrl);
      } catch {}
    };
    const stop = (event: Event) => {
      if (
        event.type === "submit" ||
        (event.target as HTMLElement)?.closest?.("a")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("message", receive);
    document.addEventListener("click", stop, true);
    document.addEventListener("submit", stop, true);
    parent.postMessage({ type: "appearance-ready", nonce }, origin);
    return () => {
      window.removeEventListener("message", receive);
      document.removeEventListener("click", stop, true);
      document.removeEventListener("submit", stop, true);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);
  return (
    <AppearanceProvider config={config} preview logoUrl={logo}>
      <div
        className="storefront-root min-h-screen pb-24"
        data-theme-active={!isLegacy(config)}
        data-gradient-highlight-card={config.gradients.highlightCard.enabled}
        style={themeStyle(config)}
      >
        <StorefrontHeader user={null} cartCount={2} />
        <main className="container space-y-8 py-6">
          <p className="text-xs text-ink-soft">
            PREVIEW • Interaksi belanja dinonaktifkan
          </p>
          <section
            data-theme-target="promo"
            className="rounded-2xl bg-surface p-8"
          >
            <p className="text-sm">Koleksi pilihan</p>
            <h1 className="mb-4 text-3xl font-bold">
              toko ini
            </h1>
            <Button>Lihat koleksi</Button>
          </section>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <ProductCard
                key={i}
                preview
                product={{
                  id: `preview-${i}`,
                  slug: `preview-${i}`,
                  name: [
                    "Everyday Tee",
                    "Relaxed Shirt",
                    "Classic Tote",
                    "Studio Hoodie",
                  ][i - 1],
                  image: null,
                  basePrice: 199000,
                  salePrice: 149000,
                  ratingAvg: 4.8,
                  reviewCount: 12,
                  variantId: null,
                }}
              />
            ))}
          </div>
          <section className="pdp-preview-sample space-y-4">
            <h2 className="text-2xl font-bold">Detail produk</h2>
            <p className="text-ink-soft">Pilihan warna dan ukuran</p>
            <div className="flex flex-wrap gap-2">
              <button className="pdp-choice-pill" aria-pressed="true">
                Hitam
              </button>
              <button className="pdp-choice-pill" aria-pressed="false">
                Putih
              </button>
              <button className="pdp-choice-pill" disabled>
                Habis
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>Beli sekarang</Button>
              <Button variant="accent">Aksen</Button>
              <Button variant="secondary">Sekunder</Button>
              <Button variant="outline">Simpan</Button>
              <Button disabled>Habis</Button>
            </div>
            <label className="block">
              Pencarian
              <input
                className="mt-2 block w-full rounded-xl border p-3"
                placeholder="Cari koleksi"
                readOnly
              />
            </label>
          </section>
          <PurchasePreviewSamples />
        </main>
        <footer className="mt-8 p-8">
          {config.footer.showLogo && (
            <strong className="block text-xl">
              <StoreLogo />
            </strong>
          )}
          <p>{config.footer.tagline}</p>
          {config.footer.trustFeatures && (
            <p className="mt-3 text-sm">
              Pengiriman Cepat · Belanja Aman · CS Responsif
            </p>
          )}
          <p className="mt-3 text-sm">
            Syarat &amp; Ketentuan · Kebijakan Privasi
          </p>
        </footer>
        <BottomNav cartCount={2} />
      </div>
    </AppearanceProvider>
  );
}
