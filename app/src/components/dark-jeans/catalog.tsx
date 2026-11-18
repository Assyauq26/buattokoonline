"use client";

import React from "react";
import { DarkJeansHero } from "./hero";
import { DarkJeansCategoryBar, type CategoryData } from "./category-bar";
import { DarkJeansNewArrival } from "./new-arrival";
import { DarkJeansPromoBanner } from "./promo-banner";
import { DarkJeansTrustNewsletter } from "./trust-newsletter";
import type { HeroConfig } from "@/modules/hero/schema";
import type { ProductCardData } from "@/components/storefront/product-card";
import type { CampaignClock } from "@/modules/promotions/campaign.validation";
import type { StoreAppearanceV1 } from "@/modules/appearance/schema";

const PREVIEW_PRODUCTS: ProductCardData[] = [
  {
    id: "preview-1",
    name: "Street.id Baggy Jeans",
    slug: "baggy-jeans-black-denim",
    brandName: "Black Denim",
    basePrice: 299000,
    salePrice: null,
    image: "/themes/dark-jeans/product-baggy-black.jpg",
    ratingAvg: 5,
    reviewCount: 24,
    variantId: null,
  },
  {
    id: "preview-2",
    name: "Street.id Wide Leg Jeans",
    slug: "wide-leg-jeans-vintage-blue",
    brandName: "Vintage Blue",
    basePrice: 219000,
    salePrice: null,
    image: "/themes/dark-jeans/product-wide-vintage-blue.jpg",
    ratingAvg: 5,
    reviewCount: 18,
    variantId: null,
  },
  {
    id: "preview-3",
    name: "Street.id Straight Jeans",
    slug: "straight-jeans-dark-grey-denim",
    brandName: "Dark Grey Denim",
    basePrice: 299000,
    salePrice: null,
    image: "/themes/dark-jeans/product-straight-dark-grey.jpg",
    ratingAvg: 5,
    reviewCount: 32,
    variantId: null,
  },
  {
    id: "preview-4",
    name: "Street.id Loose Jeans",
    slug: "loose-jeans-blue-washed",
    brandName: "Blue Washed",
    basePrice: 299000,
    salePrice: null,
    image: "/themes/dark-jeans/product-loose-blue-washed.jpg",
    ratingAvg: 5,
    reviewCount: 15,
    variantId: null,
  },
];

export function DarkJeansCatalog({
  hero,
  categories = [],
  products = [],
  wishlistIds,
  campaign,
  config,
  preview = false,
}: {
  hero?: {
    config: HeroConfig;
    version: number;
  } | null;
  categories?: CategoryData[];
  products?: ProductCardData[];
  wishlistIds?: Set<string>;
  campaign?: CampaignClock | null;
  config?: StoreAppearanceV1;
  preview?: boolean;
}) {
  // Production storefront strictly uses real products; admin live preview falls back to preview cards
  const catalogProducts =
    products.length > 0 ? products : preview ? PREVIEW_PRODUCTS : [];

  return (
    <div className="flex flex-col w-full bg-[#0B0B0E] selection:bg-[#E5A93C] selection:text-[#0B0B0E]">
      {/* 1. Full-Width Hero Section */}
      <DarkJeansHero hero={hero} />

      {/* 2. Denim Category Silhouette Bar */}
      <DarkJeansCategoryBar categories={categories} />

      {/* 3. New Arrival Premium Denim Section */}
      <DarkJeansNewArrival products={catalogProducts} wishlistIds={wishlistIds} />

      {/* 4. Special Promo Banner (Diskon 50% + Leather Patch) */}
      <DarkJeansPromoBanner campaign={campaign} />

      {/* 5. Trust Pillars & Brand Calligraphy */}
      <DarkJeansTrustNewsletter config={config} />
    </div>
  );
}
