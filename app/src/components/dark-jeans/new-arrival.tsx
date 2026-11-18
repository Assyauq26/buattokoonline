"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { ProductCardData } from "@/components/storefront/product-card";
import { QuickAddButton } from "@/components/storefront/quick-add-button";
import { formatIDR, effectivePrice, discountPercent } from "@/lib/money";

export function DarkJeansNewArrival({
  products = [],
  wishlistIds,
}: {
  products?: ProductCardData[];
  wishlistIds?: Set<string>;
}) {
  if (products.length === 0) {
    return (
      <section className="w-full py-12 bg-[#0B0B0E]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-zinc-500 text-sm">Belum ada produk untuk ditampilkan saat ini.</p>
        </div>
      </section>
    );
  }

  // Display up to 4 items in the New Arrival section as shown in the desktop reference
  const displayProducts = products.slice(0, 4);

  return (
    <section className="w-full py-12 lg:py-16 bg-[#0B0B0E] relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Left Intro Column */}
          <div className="lg:col-span-3 flex flex-col justify-between py-2">
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold tracking-widest text-[#E5A93C] uppercase block">
                ///// NEW ARRIVAL
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight uppercase font-display leading-[1.1]">
                <span className="block text-white">New Arrival</span>
                <span className="block text-[#E5A93C]">Premium Denim</span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-sm leading-relaxed">
                Koleksi terbaru dengan kualitas terbaik untuk gaya lebih percaya diri.
              </p>
            </div>

            <div className="pt-6">
              <Link href="/shop" className="dj-btn-pill group !px-7 !py-3">
                <span>SHOP NOW</span>
                <ArrowRight
                  size={15}
                  className="text-[#E5A93C] transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>

          {/* Right Product Grid / Mobile Scroll */}
          <div className="lg:col-span-9">
            <div className="flex lg:grid lg:grid-cols-4 overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2">
              {displayProducts.map((p) => {
                const price = effectivePrice(p.basePrice, p.salePrice);
                const pct = discountPercent(p.basePrice, p.salePrice);

                return (
                  <div
                    key={p.id}
                    className="dj-card flex flex-col group w-[calc(50%-8px)] min-w-[150px] lg:w-auto shrink-0 snap-start h-full"
                  >
                    {/* Studio Image with NEW badge */}
                    <Link href={`/product/${p.slug}`} className="block relative">
                      <div className="dj-card-image-wrap">
                        <span className="dj-badge-new">NEW</span>
                        {p.image ? (
                          <Image
                            src={p.image}
                            alt={p.name}
                            fill
                            sizes="(max-width: 768px) 50vw, 25vw"
                            className="dj-card-image"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                            No image
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Card Details & Quick Add Action */}
                    <div className="p-3.5 flex flex-col flex-1 justify-between gap-3 bg-[#13151D]">
                      <div>
                        <Link
                          href={`/product/${p.slug}`}
                          className="text-xs sm:text-sm font-bold text-white hover:text-[#E5A93C] transition-colors line-clamp-1 block"
                        >
                          {p.name}
                        </Link>
                        <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                          {p.brandName || "Denim Collection"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="flex flex-col">
                          {pct > 0 && (
                            <span className="text-[10px] text-zinc-500 line-through">
                              {formatIDR(p.basePrice)}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-extrabold text-[#E5A93C] font-mono">
                            {formatIDR(price)}
                          </span>
                        </div>

                        {/* Real Storefront QuickAddButton hooked to CartInteractionProvider */}
                        <QuickAddButton
                          slug={p.slug}
                          testId={p.slug}
                          className="!w-8 !h-8 sm:!w-9 sm:!h-9 !rounded-lg border border-[#E5A93C]/40 bg-[#1A1C24] text-[#E5A93C] hover:bg-[#E5A93C] hover:text-[#0B0B0E] transition-all"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
