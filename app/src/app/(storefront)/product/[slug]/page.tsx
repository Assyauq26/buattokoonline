import { ProductDescription } from "@/components/storefront/product-description";
import { StoreLogo } from "@/components/appearance/context";

import { getPublishedAppearance } from "@/modules/appearance/published";

import { ProductInformationSheet } from "@/components/storefront/product-information-sheet";

import { ProductSizeChart } from "@/components/storefront/product-size-chart";

import { notFound } from "next/navigation";

import {
  ArrowLeft,
  FileText,
  Package,
  Truck,
} from "lucide-react";

import "@/components/storefront/product-detail.css";

import type { Metadata } from "next";

import Link from "@/components/ui/navigation";

import {
  getProductBySlug,
  getRelatedProducts,
} from "@/modules/catalog/catalog.service";

import { trackView } from "@/modules/catalog/recently-viewed.service";

import { getStorefrontUserContext } from "@/lib/auth/session";

import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

import { purchaseGroups } from "@/modules/catalog/purchase-options";

import {
  ProductSelectionProvider,
  ProductSelectionPrice,
} from "@/components/storefront/product-selection";

import {
  effectiveVariantPrice,
  variantPromotionAvailability,
  effectiveProductPrice,
} from "@/modules/promotions/scheduled-flash-sale";

import { Rating } from "@/components/ui/rating";

import { Badge } from "@/components/ui/badge";

import { ProductGallery } from "@/components/storefront/product-gallery";

import { PurchasePanel } from "@/components/storefront/purchase-panel";

import { ShareButton } from "@/components/storefront/share-button";

import { WishlistButton } from "@/components/storefront/wishlist-button";

import { ProductDisclosure } from "@/components/storefront/product-disclosure";

import { SectionHeader } from "@/components/storefront/section-header";

import { ProductCard, toCardData } from "@/components/storefront/product-card";

export const dynamic = "force-dynamic";

type ProductRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductRouteProps): Promise<Metadata> {
  const { slug } = await params;

  const product = await getProductBySlug(slug);

  if (!product) return { title: "Produk tidak ditemukan" };

  return {
    title: product.name,

    description: product.description.slice(0, 160),

    alternates: { canonical: `/product/${product.slug}` },

    openGraph: {
      title: product.name,

      description: product.description.slice(0, 160),

      images: product.images[0]?.url ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({ params }: ProductRouteProps) {
  const { slug } = await params;

  const [product, user, appearance] = await Promise.all([
    getProductBySlug(slug),

    getStorefrontUserContext(),

    getPublishedAppearance(),
  ]);

  if (!product) notFound();

  const [related, wishIds] = await Promise.all([
    getRelatedProducts({ id: product.id, categoryId: product.categoryId }),

    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  // Analytics must never block the product response. The previous awaited

  // write added a database round-trip to every product navigation.

  if (user) void trackView(user.id, product.id).catch(() => {});

  const wl = new Set(wishIds);

  const price = effectiveProductPrice(product);

  const variantOptions = product.variants.map((v) => ({
    id: v.id,

    sku: v.sku,

    optionValueIds: v.optionValues.map((s) => s.valueId),

    price:effectiveVariantPrice(product,v),

    originalPrice: v.price ?? product.basePrice,

    color: v.color,

    size: v.size,

    available:variantPromotionAvailability(product,v.id,v.inventory?v.inventory.onHand-v.inventory.reserved:0),
  }));

  const purchase = {
    id: product.id,

    slug: product.slug,

    name: product.name,

    brand: product.brand?.name ?? null,

    image: product.images[0] ?? null,

    ...purchaseGroups(
      variantOptions,

      product.optionsEnabled ? product.optionGroups : [],
    ),
  };

  const jsonLd = {
    "@context": "https://schema.org",

    "@type": "Product",

    name: product.name,

    image: product.images.map((i) => i.url),

    description: product.description,

    brand: {
      "@type": "Brand",
      name: product.brand?.name ?? appearance.config.identity.name,
    },

    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",

            ratingValue: product.ratingAvg,

            reviewCount: product.reviewCount,
          },
        }
      : {}),

    offers: {
      "@type": "Offer",

      price,

      priceCurrency: "IDR",

      availability: variantOptions.some((v) => v.available > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="pdp-page">
      <script
        type="application/ld+json"

        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <ProductSelectionProvider key={product.id}>
        <div className="pdp-main" data-testid="pdp-main">
          <div
            className="pdp-topbar"

            aria-label="Navigasi produk"

            data-testid="pdp-header"
          >
            <Link
              href="/"

              aria-label="Kembali ke beranda"

              className="pdp-header-action grid h-11 w-11 place-items-center"

              data-testid="pdp-back-home"
            >
              <ArrowLeft size={23} aria-hidden="true" />
            </Link>

            <Link
              href="/"

              aria-label="Ke beranda"

              className="pdp-topbar-center font-display font-extrabold tracking-tight"

              data-testid="pdp-centered-logo"
            >
              <StoreLogo />
            </Link>

            <div className="pdp-topbar-actions">
              <WishlistButton
                productId={product.id}

                initialActive={wl.has(product.id)}

                className="pdp-header-action h-11 w-11"
              />

              <ShareButton title={product.name} iconOnly />
            </div>
          </div>

          <div className="pdp-hero">
            <div className="pdp-media">
              <ProductGallery images={product.images} name={product.name} />
            </div>
          </div>

          <ProductInformationSheet>
            <div className="pdp-info">
              <div className="mb-1.5 text-sm font-medium text-zinc-400">
                {product.brand?.name ?? appearance.config.identity.name}
              </div>

              <h1 className="pdp-heading text-[1.75rem] font-extrabold leading-tight text-zinc-950 sm:text-[2rem]">
                {product.name}
              </h1>

              <div className="my-5">
                <ProductSelectionPrice
                  defaultPrice={price}

                  basePrice={product.basePrice}
                />
              </div>

              <a
                href="#reviews"

                className="mt-2.5 inline-flex items-center gap-2 text-sm text-zinc-500"
              >
                {product.reviewCount > 0 && (
                  <Rating value={product.ratingAvg} size={16} />
                )}

                <span>
                  {product.reviewCount > 0
                    ? `${product.reviewCount} ulasan`
                    : "Belum ada ulasan"}
                </span>
              </a>

              <PurchasePanel product={purchase} />

              <ProductSizeChart
                chart={product.sizeChart}

                image={product.sizeChartImage}

                name={product.name}
              />
              <div className="pdp-information-rows">
                <ProductDisclosure title="Deskripsi" icon={<FileText size={19} aria-hidden="true" />} defaultOpen>
                  <ProductDescription text={product.description} />
                </ProductDisclosure>
                <ProductDisclosure title="Material & Perawatan" icon={<Package size={19} aria-hidden="true" />}>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                    {[product.material, product.careInstruction].filter(Boolean).join("\n") || "Informasi material dan perawatan belum tersedia."}
                  </p>
                </ProductDisclosure>
                <ProductDisclosure title="Pengiriman & Retur" icon={<Truck size={19} aria-hidden="true" />}>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                    {product.shippingReturn || "Informasi pengiriman dan retur belum tersedia."}
                  </p>
                </ProductDisclosure>
              </div>
            </div>

            <div className="pdp-below space-y-12">
              <section id="reviews">
                <SectionHeader title={`Ulasan (${product.reviewCount})`} />

                <div className="space-y-4">
                  {product.reviews.length === 0 && (
                    <p className="text-sm text-ink-soft">
                      <strong className="block">
                        Belum ada ulasan pembeli
                      </strong>
                    </p>
                  )}

                  {product.reviews.map((r) => (
                    <div
                      key={r.id}

                      className="public-review-card min-w-0 rounded-2xl border border-line p-4"

                      data-testid={`review-${r.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">
                          {r.user.name}
                        </span>

                        <Rating value={r.rating} />
                      </div>

                      <Badge variant="muted" className="my-2">
                        Pembelian Terverifikasi
                      </Badge>

                      <p className="text-xs text-ink-muted">
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",

                          timeZone: "Asia/Jakarta",
                        }).format(r.createdAt)}{" "}
                        · {r.variantLabel}
                      </p>

                      {r.title && (
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {r.title}
                        </p>
                      )}

                      <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
                    </div>
                  ))}
                </div>
              </section>

              {related.length > 0 && (
                <section>
                  <SectionHeader title="Kamu Mungkin Suka" href="/shop" />

                  <div className="pdp-related-grid grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
                    {related.slice(0, 4).map((p) => (
                      <ProductCard
                        hideEmptyRating
                        key={p.id}

                        product={toCardData(p)}

                        wishlisted={wl.has(p.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </ProductInformationSheet>
        </div>
      </ProductSelectionProvider>
    </div>
  );
}
