"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { StreetIdLogo } from "./icons";

interface HeroProps {
  onShopClick?: () => void;
}

export function DarkJeansHero({ onShopClick }: HeroProps) {
  const [currentSlide, setCurrentSlide] = useState(1);
  const totalSlides = 3;

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev % totalSlides) + 1);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 1 ? totalSlides : prev - 1));
  };

  return (
    <section className="relative w-full dj-hero min-h-[580px] lg:min-h-[660px] flex items-center dark-jeans-twill-bg overflow-hidden">
      {/* Golden volumetric lighting & ambient glow overlays */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#E5A93C]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-80 h-80 bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0E] via-[#0B0B0E]/60 to-transparent z-10 pointer-events-none hidden lg:block" />

      {/* Main Grid Container */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Column: Brand Mark, Headline, Tagline, CTA, Pager */}
        <div className="lg:col-span-7 flex flex-col items-start gap-6 max-w-xl">
          {/* Stitched Logo Emblem */}
          <div className="flex items-center gap-3">
            <StreetIdLogo size={90} variant="stacked" />
          </div>

          {/* Headline Typography */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white uppercase font-display leading-[1.05]">
              <span className="block text-white">More Than</span>
              <span className="block dj-hero-title-metallic">Just Jeans</span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 font-medium tracking-wide">
              Upgrade Your Style, Step Up Your Attitude.
            </p>
          </div>

          {/* CTA Button */}
          <div className="pt-2">
            <Link
              href="/shop"
              onClick={onShopClick}
              className="dj-btn-pill group !px-8 !py-3.5"
            >
              <span>SHOP NOW</span>
              <ArrowRight
                size={16}
                className="text-[#E5A93C] transition-transform duration-200 group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* Slider Pagination Controls: 01 / 003  < > */}
          <div className="flex items-center gap-4 pt-6 text-xs font-mono text-zinc-400">
            <span className="tracking-widest">
              <strong className="text-white text-sm">
                {String(currentSlide).padStart(2, "0")}
              </strong>{" "}
              / 003
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevSlide}
                className="dj-icon-btn !w-8 !h-8 text-zinc-400 hover:text-white"
                aria-label="Slide sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                className="dj-icon-btn !w-8 !h-8 text-zinc-400 hover:text-white"
                aria-label="Slide berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Streetwear Model Visual + Watermark */}
        <div className="lg:col-span-5 relative flex justify-center items-center">
          {/* Visual Canvas Box */}
          <div className="relative w-full max-w-[540px] aspect-[16/11] rounded-2xl overflow-hidden border border-[#E5A93C]/30 shadow-2xl group bg-[#111319]">
            {/* Visual Image */}
            <Image
              src="/themes/dark-jeans/hero-model.jpg"
              alt="street.id Jeans Collection Model"
              fill
              priority
              className="object-cover object-[65%_35%] transition-transform duration-700 ease-out group-hover:scale-105"
            />

            {/* Subtle Vignette overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-0 ring-1 ring-inset ring-[#E5A93C]/20 rounded-2xl pointer-events-none" />

            {/* Diagonal Gold Accent Line */}
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-gradient-to-bl from-[#E5A93C]/30 to-transparent blur-xl pointer-events-none" />
          </div>

          {/* Stylized Vertical Watermark on right edge */}
          <div className="hidden sm:flex absolute -right-6 lg:-right-10 top-1/2 -translate-y-1/2 dj-watermark text-[10px]">
            street.id jeans &nbsp;&bull;&nbsp; est. 2025
          </div>
        </div>

      </div>
    </section>
  );
}
