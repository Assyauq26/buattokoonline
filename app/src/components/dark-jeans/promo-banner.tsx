"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Zap } from "lucide-react";
import type { CampaignClock } from "@/modules/promotions/campaign.validation";
import type { DarkJeansPromoConfig } from "@/modules/appearance/schema";

export function DarkJeansPromoBanner({
  campaign,
  config,
  preview = false,
}: {
  campaign?: CampaignClock | null;
  config?: DarkJeansPromoConfig;
  preview?: boolean;
}) {
  const isEnabled = config?.enabled ?? (preview || !!campaign);
  if (!isEnabled && !preview) {
    return null;
  }

  const isCampaignActive = !!campaign;
  const targetHref = config?.ctaHref || (isCampaignActive ? "/shop?flash=1" : "/shop");
  const ctaLabel = config?.ctaLabel || "SHOP NOW";
  const displayMode = config?.displayMode || "artwork";
  const altText = config?.altText || "Special Promo Diskon";

  const desktopImage = config?.desktopAssetId
    ? `/api/v1/store-branding/${config.desktopAssetId}`
    : "/themes/dark-jeans/promo-desktop.jpg";

  const mobileImage = config?.mobileAssetId
    ? `/api/v1/store-branding/${config.mobileAssetId}`
    : config?.desktopAssetId
    ? `/api/v1/store-branding/${config.desktopAssetId}`
    : "/themes/dark-jeans/promo-mobile.jpg";

  return (
    <section className="w-full py-4 sm:py-8 bg-[#080808]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <Link
          href={targetHref}
          className="group block relative w-full rounded-xl sm:rounded-2xl overflow-hidden border border-[#D9AC61]/35 shadow-2xl transition-all duration-300 hover:border-[#D9AC61]/60 hover:shadow-[0_12px_32px_rgba(217,172,97,0.15)]"
          aria-label={altText}
        >
          {/* DESKTOP PANORAMIC ARTWORK (~4.28:1 ratio matching promo-desktop.jpg) */}
          <div className="hidden sm:block relative w-full aspect-[4.28/1] overflow-hidden bg-[#0F1116]">
            <Image
              src={desktopImage}
              alt={altText}
              fill
              priority
              sizes="100vw"
              className="object-contain object-center transition-transform duration-500 ease-out group-hover:scale-[1.01]"
            />
          </div>

          {/* MOBILE COMPACT ARTWORK (~2.90:1 ratio matching promo-mobile.jpg) */}
          <div className="sm:hidden relative w-full aspect-[2.90/1] overflow-hidden bg-[#0F1116]">
            <Image
              src={mobileImage}
              alt={altText}
              fill
              priority
              sizes="100vw"
              className="object-contain object-center"
            />
          </div>

          {/* OVERLAY MODE: If seller selected overlay mode and added custom copy */}
          {displayMode === "overlay" && (
            <div className="absolute inset-0 z-10 flex items-center bg-black/40 p-4 sm:p-8">
              <div className="max-w-md space-y-1.5 sm:space-y-2">
                <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-[#D9AC61] uppercase block">
                  SPECIAL PROMO
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-3xl font-black text-white uppercase">
                    {config?.heading || "DISKON"}
                  </span>
                  {config?.highlightedDiscount && (
                    <span className="text-xl sm:text-3xl font-black text-[#D9AC61]">
                      {config.highlightedDiscount}
                    </span>
                  )}
                  <Zap className="text-[#D9AC61] fill-[#D9AC61] w-4 h-4 sm:w-6 sm:h-6" />
                </div>
                {config?.description && (
                  <p className="text-[10px] sm:text-xs text-zinc-300 font-medium">
                    {config.description}
                  </p>
                )}
                <div className="pt-1 sm:pt-2">
                  <span className="dj-btn-pill !text-[10px] sm:!text-xs !py-1.5 sm:!py-2 !px-4 inline-flex items-center gap-1.5">
                    <span>{ctaLabel}</span>
                    <ArrowRight size={12} className="text-[#D9AC61]" />
                  </span>
                </div>
              </div>
            </div>
          )}
        </Link>
      </div>
    </section>
  );
}
