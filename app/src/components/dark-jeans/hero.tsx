"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroConfig } from "@/modules/hero/schema";

interface HeroProps {
  hero?: {
    config: HeroConfig;
    version: number;
  } | null;
  onShopClick?: () => void;
}

export function DarkJeansHero({ hero, onShopClick }: HeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const customSlides =
    hero?.config?.enabled && hero.config.slides.length > 0
      ? hero.config.slides.map((s) => ({
          id: s.id,
          desktopImage: s.desktopAssetId
            ? `/api/v1/store-hero/${s.desktopAssetId}`
            : "/themes/dark-jeans/hero-desktop.jpg",
          mobileImage: s.mobileAssetId
            ? `/api/v1/store-hero/${s.mobileAssetId}`
            : s.desktopAssetId
            ? `/api/v1/store-hero/${s.desktopAssetId}`
            : "/themes/dark-jeans/hero-mobile.jpg",
          alt: s.alt || "Hero Banner",
          heading: s.heading || "",
          description: s.description || "",
          ctaLabel: s.ctaLabel || "",
          ctaHref: s.ctaHref || "/shop",
          align: s.align || "left",
          tone: s.tone || "dark",
          overlay: s.overlay ?? 0,
        }))
      : [];

  const defaultSlide = {
    id: "default-dark-jeans-slide",
    desktopImage: "/themes/dark-jeans/hero-desktop.jpg",
    mobileImage: "/themes/dark-jeans/hero-mobile.jpg",
    alt: "street.id Jeans Collection — More Than Just Jeans",
    heading: "", // Artwork has typography embedded
    description: "",
    ctaLabel: "SHOP NOW",
    ctaHref: "/shop",
    align: "left" as const,
    tone: "dark" as const,
    overlay: 0,
  };

  const slides = customSlides.length > 0 ? customSlides : [defaultSlide];
  const slide = slides[currentIndex] || slides[0];

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = (hero?.config?.autoplaySeconds || 6) * 1000;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, interval);
    return () => clearInterval(timer);
  }, [slides.length, hero?.config?.autoplaySeconds]);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  return (
    <section className="relative w-full dj-hero overflow-hidden bg-[#0B0B0E]">
      {/* Full-width edge-to-edge container */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[2/1] md:aspect-[2.28/1] min-h-[280px] sm:min-h-[380px] md:min-h-[440px] max-h-[640px] overflow-hidden select-none">
        
        {/* Banner Images (Desktop & Mobile) */}
        <Link
          href={slide.ctaHref || "/shop"}
          onClick={onShopClick}
          className="block absolute inset-0 z-10 cursor-pointer"
          aria-label={slide.alt}
        >
          {/* Desktop panoramic banner artwork */}
          <div className="hidden md:block relative w-full h-full">
            <Image
              src={slide.desktopImage}
              alt={slide.alt}
              fill
              priority
              className="object-cover object-center transition-transform duration-700 ease-out hover:scale-[1.01]"
            />
          </div>

          {/* Mobile banner artwork */}
          <div className="block md:hidden relative w-full h-full">
            <Image
              src={slide.mobileImage}
              alt={slide.alt}
              fill
              priority
              className="object-cover object-center"
            />
          </div>

          {/* Optional Overlay Darkness if configured by seller */}
          {slide.overlay > 0 && (
            <div
              className="absolute inset-0 bg-black pointer-events-none"
              style={{ opacity: slide.overlay / 100 }}
            />
          )}
        </Link>

        {/* Text Overlay (ONLY if heading/description was provided by seller) */}
        {slide.heading && (
          <div className="absolute inset-0 z-20 flex items-center px-6 sm:px-12 lg:px-20 pointer-events-none">
            <div
              className={`max-w-xl flex flex-col gap-3 pointer-events-auto ${
                slide.align === "center"
                  ? "items-center text-center mx-auto"
                  : slide.align === "right"
                  ? "items-end text-right ml-auto"
                  : "items-start text-left"
              }`}
            >
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight uppercase font-display leading-[1.08]">
                <span className="block dj-hero-title-metallic">{slide.heading}</span>
              </h1>
              {slide.description && (
                <p className="text-xs sm:text-sm lg:text-base text-zinc-300 font-medium tracking-wide">
                  {slide.description}
                </p>
              )}
              {slide.ctaLabel && (
                <div className="pt-2">
                  <Link
                    href={slide.ctaHref}
                    onClick={onShopClick}
                    className="dj-btn-pill group !px-8 !py-3.5"
                  >
                    <span>{slide.ctaLabel}</span>
                    <ArrowRight
                      size={16}
                      className="text-[#E5A93C] transition-transform duration-200 group-hover:translate-x-1"
                    />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Desktop Carousel Navigation Controls: 01 / 003  < > */}
        <div className="absolute bottom-5 left-6 sm:left-12 lg:left-20 z-30 hidden sm:flex items-center gap-4 text-xs font-mono text-zinc-300 bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-lg">
          <span className="tracking-widest">
            <strong className="text-white text-sm">
              {String(currentIndex + 1).padStart(2, "0")}
            </strong>{" "}
            / {String(slides.length).padStart(3, "0")}
          </span>
          {slides.length > 1 && (
            <div className="flex items-center gap-1.5 ml-2 border-l border-white/15 pl-2">
              <button
                type="button"
                onClick={prevSlide}
                className="dj-icon-btn !w-6 !h-6 text-zinc-300 hover:text-white"
                aria-label="Slide sebelumnya"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                className="dj-icon-btn !w-6 !h-6 text-zinc-300 hover:text-white"
                aria-label="Slide berikutnya"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Pagination Dots: ● ○ ○ */}
        {slides.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex sm:hidden items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`transition-all duration-200 rounded-full ${
                  idx === currentIndex
                    ? "w-4 h-1.5 bg-[#E5A93C]"
                    : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                }`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
