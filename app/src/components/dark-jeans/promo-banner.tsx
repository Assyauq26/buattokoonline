"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Zap } from "lucide-react";
import type { CampaignClock } from "@/modules/promotions/campaign.validation";

export function DarkJeansPromoBanner({
  campaign,
}: {
  campaign?: CampaignClock | null;
}) {
  const isCampaignActive = !!campaign;
  const targetHref = isCampaignActive ? "/shop?flash=1" : "/shop";

  return (
    <section className="w-full py-6 md:py-10 bg-[#0B0B0E]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="dj-promo-banner grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 sm:p-10 lg:p-12 relative overflow-hidden">
          {/* Subtle gold ambient glow in the banner background */}
          <div className="absolute top-0 right-1/3 w-80 h-80 bg-[#E5A93C]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Left Side: Headlines & CTA */}
          <div className="lg:col-span-7 flex flex-col items-start gap-4 sm:gap-6 z-10">
            <span className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#E5A93C] uppercase font-mono">
              SPECIAL PROMO
            </span>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight">
                  DISKON
                </span>
                <Zap className="text-[#E5A93C] fill-[#E5A93C] w-7 h-7 sm:w-10 sm:h-10" />
              </div>

              <div className="dj-promo-headline">
                50%&quot;
              </div>
            </div>

            <p className="text-sm sm:text-base font-bold tracking-wider text-zinc-300 uppercase">
              UPGRADE STYLE, SAVE MORE!
            </p>

            <Link href={targetHref} className="dj-btn-pill group !px-8 !py-3.5 mt-2">
              <span>SHOP NOW</span>
              <ArrowRight
                size={16}
                className="text-[#E5A93C] transition-transform duration-200 group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* Right Side: Stitched Leather Patch on Dark Denim Pocket */}
          <div className="lg:col-span-5 relative flex justify-center items-center z-10">
            <div className="relative w-full max-w-[420px] aspect-[4/3] rounded-2xl overflow-hidden border border-[#E5A93C]/30 shadow-2xl group">
              <Image
                src="/themes/dark-jeans/promo-leather-patch.jpg"
                alt="street.id Stitched Leather Patch Denim Pocket"
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
              <div className="absolute inset-0 ring-1 ring-inset ring-[#E5A93C]/20 rounded-2xl pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
