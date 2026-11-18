"use client";

import React from "react";
import { DarkJeansHero } from "./hero";
import { DarkJeansCategoryBar } from "./category-bar";
import { DarkJeansNewArrival, DenimProduct } from "./new-arrival";
import { DarkJeansPromoBanner } from "./promo-banner";
import { DarkJeansTrustNewsletter } from "./trust-newsletter";

export function DarkJeansCatalog({
  products,
  preview = false,
}: {
  products?: DenimProduct[];
  preview?: boolean;
}) {
  return (
    <div className="flex flex-col w-full bg-[#0B0B0E] selection:bg-[#E5A93C] selection:text-[#0B0B0E]">
      {/* 1. Hero Section */}
      <DarkJeansHero />

      {/* 2. Denim Category Silhouette Bar */}
      <DarkJeansCategoryBar />

      {/* 3. New Arrival Premium Denim Section */}
      <DarkJeansNewArrival products={products} />

      {/* 4. Special Promo Banner (Diskon 50% + Leather Patch) */}
      <DarkJeansPromoBanner />

      {/* 5. Trust Pillars & Newsletter Bar */}
      <DarkJeansTrustNewsletter />
    </div>
  );
}
