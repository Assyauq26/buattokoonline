"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard, type ProductCardData } from "@/components/storefront/product-card";
import type { DarkJeansNewArrivalConfig } from "@/modules/appearance/schema";

export function DarkJeansNewArrival({
  products = [],
  wishlistIds,
  config,
  preview = false,
}: {
  products?: ProductCardData[];
  wishlistIds?: Set<string>;
  config?: DarkJeansNewArrivalConfig;
  preview?: boolean;
}) {
  if (config?.enabled === false) {
    return null;
  }

  if (products.length === 0 && !preview) {
    return null;
  }

  const eyebrow = config?.eyebrow ?? "///// NEW ARRIVAL";
  const heading = config?.heading ?? "New Arrival";
  const highlightedHeading = config?.highlightedHeading ?? "Premium Denim";
  const description =
    config?.description ??
    "Koleksi terbaru dengan kualitas terbaik untuk gaya lebih percaya diri.";
  const ctaLabel = config?.ctaLabel ?? "SHOP NOW";
  const ctaHref = config?.ctaHref ?? "/shop";
  const displayCount = config?.displayCount ?? 4;

  const displayProducts = products.slice(0, displayCount);

  return (
    <section className="w-full py-8 md:py-14 bg-[#080808] relative overflow-hidden">
      {/* Subtle background ambient glow */}
      <div className="absolute top-1/2 left-0 w-72 h-72 bg-[#D9AC61]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
        
        {/* DESKTOP LAYOUT (Mockup matching: ~24% Left Intro, ~76% Right 4-Product Grid) */}
        <div className="hidden md:grid md:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* Left Intro Column */}
          <div className="md:col-span-4 lg:col-span-3 flex flex-col justify-between py-2">
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold tracking-widest text-[#D9AC61] uppercase block">
                {eyebrow}
              </span>
              <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight uppercase font-display leading-[1.1]">
                <span className="block text-white">{heading}</span>
                <span className="block text-[#D9AC61]">{highlightedHeading}</span>
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                {description}
              </p>
            </div>

            <div className="pt-6">
              <Link
                href={ctaHref}
                className="dj-btn-pill group !px-6 !py-2.5 text-xs inline-flex items-center gap-2"
              >
                <span>{ctaLabel}</span>
                <ArrowRight
                  size={14}
                  className="text-[#D9AC61] transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>

          {/* Right 4-Product Grid */}
          <div className="md:col-span-8 lg:col-span-9">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {displayProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  wishlisted={wishlistIds?.has(p.id)}
                  preview={preview}
                  variant="dark-jeans"
                />
              ))}
            </div>
          </div>
        </div>

        {/* MOBILE LAYOUT (Mockup matching: Compact Left Intro + Horizontal Product Rail) */}
        <div className="md:hidden flex flex-row items-stretch gap-3 overflow-hidden">
          {/* Compact Left Intro Column */}
          <div className="w-[125px] sm:w-[145px] shrink-0 flex flex-col justify-between py-1">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold tracking-wider text-[#D9AC61] uppercase block">
                {eyebrow}
              </span>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight uppercase font-display leading-tight">
                <span className="block text-white">{heading}</span>
                <span className="block text-[#D9AC61] text-sm sm:text-base">
                  {highlightedHeading}
                </span>
              </h2>
              <p className="text-[10px] text-zinc-400 line-clamp-3 leading-snug">
                {description}
              </p>
            </div>

            <div className="pt-2">
              <Link
                href={ctaHref}
                className="dj-btn-pill group !px-3 !py-1.5 !text-[10px] w-full justify-between"
              >
                <span>{ctaLabel}</span>
                <ArrowRight size={12} className="text-[#D9AC61] shrink-0" />
              </Link>
            </div>
          </div>

          {/* Right Product Scroll Rail */}
          <div className="flex-1 min-w-0 flex overflow-x-auto no-scrollbar gap-2.5 pb-1 snap-x snap-mandatory">
            {displayProducts.map((p) => (
              <div
                key={p.id}
                className="w-[140px] sm:w-[160px] shrink-0 snap-start"
              >
                <ProductCard
                  product={p}
                  wishlisted={wishlistIds?.has(p.id)}
                  preview={preview}
                  variant="dark-jeans"
                />
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
