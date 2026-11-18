import { publicCampaign } from "@/modules/promotions/campaign-pricing";
import { campaignState } from "@/modules/promotions/campaign.validation";
import { FlashSaleBanner } from "@/components/storefront/flash-sale-banner";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { getPublishedHero } from "@/modules/hero/published";
import { CategoryNav } from "@/components/storefront/category-nav";
import { SectionHeader } from "@/components/storefront/section-header";
import { ProductCard, toCardData } from "@/components/storefront/product-card";
import {
  listProducts,
  listCategories,
} from "@/modules/catalog/catalog.service";
import { getStorefrontUserContext } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";
import { getPublishedAppearance } from "@/modules/appearance/published";
import { fashionFrame } from "@/modules/catalog/fashion-catalog";
import { FashionCatalog } from "@/components/fashion/catalog";
import { DarkJeansCatalog } from "@/components/dark-jeans/catalog";
import "./home.css";

export const metadata = { alternates: { canonical: "/" } };
export default async function HomePage({searchParams}: {searchParams: Promise<{koleksi?:string; posisi?:string}>}) {
  const { config } = await getPublishedAppearance();
  if (config.themeId === "immersive-fashion") {
    const params = await searchParams;
    return <FashionCatalog frame={await fashionFrame(config.collections, params.koleksi, Number(params.posisi) - 1)} />;
  }
  if (config.themeId === "dark-jeans") {
    const latest = await listProducts({ sort: "newest", pageSize: 8, includeTotal: false });
    const denimItems = latest.items.filter(
      (p) =>
        p.name.toLowerCase().includes("jean") ||
        p.name.toLowerCase().includes("denim") ||
        p.category?.name?.toLowerCase().includes("jean") ||
        p.category?.name?.toLowerCase().includes("denim")
    );
    const mapped = denimItems.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      categoryName: p.category?.name || "Denim Collection",
      price: Number(p.price) || 299000,
      image: p.images?.[0]?.url || "/themes/dark-jeans/product-baggy-black.jpg",
      isNew: true,
    }));
    return <DarkJeansCatalog products={mapped.length > 0 ? mapped : undefined} />;
  }
  const wishIdsPromise = getStorefrontUserContext().then((user) =>
    user ? wishlistProductIds(user.id) : [],
  );
  const [categories, featured, latest, wishIds, flash, hero, campaign] =
    await Promise.all([
      listCategories(),
      listProducts({ featured: true, pageSize: 4, includeTotal: false }),
      listProducts({ sort: "newest", pageSize: 8, includeTotal: false }),
      wishIdsPromise,
      listProducts({ flashSale: true, pageSize: 1, includeTotal: false }),
      getPublishedHero(),
      publicCampaign(),
    ]);

  const wl = new Set(wishIds);
  // Some seed/catalog data may not have isFeatured flags yet. Keep the section
  // useful by falling back to the newest published products instead of rendering
  // an empty section when the catalog itself is populated.
  const featuredItems =
    featured.items.length > 0 ? featured.items : latest.items.slice(0, 4);

  // Zero published versions keep the existing banners until the first Publish.
  const slides =
    hero.config.enabled
        ? hero.config.slides.map((slide) => ({
            image: `/api/v1/store-hero/${slide.desktopAssetId}`,
            mobileImage: slide.mobileAssetId
              ? `/api/v1/store-hero/${slide.mobileAssetId}`
              : undefined,
            alt: slide.alt,
            heading: slide.heading,
            description: slide.description,
            ctaLabel: slide.ctaLabel,
            ctaHref: slide.ctaHref,
            align: slide.align,
            tone: slide.tone,
            overlay: slide.overlay,
          }))
        : [];

  return (
    <div className="store-home grid gap-6 lg:gap-4">
      <HeroCarousel
        slides={slides}
        autoplaySeconds={hero.config.autoplaySeconds}
      />

      <section className="home-categories">
        {latest.items.length === 0 && <p className="mb-6 rounded-xl border border-zinc-200 p-8 text-center text-zinc-600">Belum ada produk. Silakan kunjungi kembali.</p>}
        <SectionHeader title="Kategori" href="/shop" />
        <CategoryNav categories={categories} />
      </section>

      {campaign &&
        (campaignState(campaign, campaign.serverNow) === "UPCOMING" ||
          (campaignState(campaign, campaign.serverNow) === "ACTIVE" &&
            flash.items.length > 0)) && <FlashSaleBanner campaign={campaign} />}

      <div className="home-products">
      <section className="min-w-0">
        <SectionHeader
          title="Produk Pilihan"
          subtitle="Pilihan produk dari toko kami"
          href="/shop"
        />
        <div
          className="home-featured stagger flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Produk pilihan"
        >
          {featuredItems.map((p) => {
            const card = toCardData(p);
            return (
              <div
                key={p.id}
                className="featured-card-track flex w-[calc((100%-20px)/3)] min-w-[12rem] shrink-0 snap-start"
              >
                <ProductCard
                  product={card}
                  wishlisted={wl.has(p.id)}
                  homeFeatured
                />
              </div>
            );
          })}
        </div>
      </section>

      {latest.items.length > 0 && <section className="min-w-0">
        <SectionHeader title="Produk Terbaru" subtitle="Temukan koleksi terbaru dari toko kami." href="/shop?sort=newest" />
        <div className="home-latest">
          {latest.items.map((p) => (
            <ProductCard
              key={p.id}
              product={toCardData(p)}
              wishlisted={wl.has(p.id)}
            />
          ))}
        </div>
      </section>}
      </div>
    </div>
  );
}
