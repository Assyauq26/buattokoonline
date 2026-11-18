"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import type { HeroConfig } from "@/modules/hero/schema";

interface HeroProps {
  hero?: {
    config: HeroConfig;
    version: number;
  } | null;
  onShopClick?: () => void;
  preview?: boolean;
}

export function DarkJeansHero({ hero, onShopClick, preview = false }: HeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // If hero is disabled by seller and not in preview mode, do not render
  const isEnabled = hero?.config?.enabled ?? false;
  if (!isEnabled && !preview) {
    return null;
  }

  const customSlides =
    hero?.config?.slides && hero.config.slides.length > 0
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

  const previewSlide = {
    id: "preview-dark-jeans-slide",
    desktopImage: "/themes/dark-jeans/hero-desktop.jpg",
    mobileImage: "/themes/dark-jeans/hero-mobile.jpg",
    alt: "Dark Jeans Collection — More Than Just Jeans",
    heading: "",
    description: "",
    ctaLabel: "SHOP NOW",
    ctaHref: "/shop",
    align: "left" as const,
    tone: "dark" as const,
    overlay: 0,
  };

  const slides =
    customSlides.length > 0
      ? customSlides
      : preview
      ? [previewSlide]
      : [];

  if (slides.length === 0) {
    return null;
  }

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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50) {
      nextSlide();
    } else if (distance < -50) {
      prevSlide();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const padZero = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  return (
    <section
      className="relative w-full dj-hero overflow-hidden bg-[#080808] select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative w-full">
        <Link
          href={slide.ctaHref || "/shop"}
          onClick={onShopClick}
          className="block w-full cursor-pointer relative"
          aria-label={slide.alt}
        >
          {/* DESKTOP BANNER (Natural panoramic aspect ratio ~2.29:1 without cropping) */}
          <div className="hidden md:block relative w-full aspect-[2.29/1] overflow-hidden">
            <Image
              src={slide.desktopImage}
              alt={slide.alt}
              fill
              priority
              sizes="100vw"
              className="object-contain object-center transition-transform duration-700 ease-out hover:scale-[1.01]"
            />
          </div>

          {/* MOBILE BANNER (Natural mobile aspect ratio ~1.89:1 without cropping text or models) */}
          <div className="md:hidden relative w-full aspect-[1.89/1] overflow-hidden">
            <Image
              src={slide.mobileImage}
              alt={slide.alt}
              fill
              priority
              sizes="100vw"
              className="object-contain object-center"
            />
          </div>

          {/* Optional Text Overlay (Only rendered if seller explicitly entered heading/description) */}
          {(slide.heading || slide.description) && (
            <div className="absolute inset-0 z-20 flex items-center bg-black/30 p-6 md:p-12">
              <div className="max-w-xl space-y-3">
                {slide.heading && (
                  <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight uppercase">
                    {slide.heading}
                  </h1>
                )}
                {slide.description && (
                  <p className="text-xs md:text-sm text-zinc-300">
                    {slide.description}
                  </p>
                )}
                {slide.ctaLabel && (
                  <div className="pt-2">
                    <span className="dj-btn-pill text-xs !py-2 !px-5 inline-flex items-center gap-1.5">
                      {slide.ctaLabel}
                      <ArrowRight size={14} className="text-[#D9AC61]" />
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Link>

        {/* CAROUSEL CONTROLS (Only when multiple slides exist) */}
        {slides.length > 1 && (
          <>
            {/* Desktop Carousel Indicators & Controls */}
            <div className="hidden md:flex absolute bottom-4 left-6 z-30 items-center gap-3 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs font-mono text-zinc-300">
              <span className="font-bold text-white tracking-widest">
                {padZero(currentIndex + 1)} / {padZero(slides.length)}
              </span>
              <div className="flex items-center gap-1 pl-2 border-l border-white/20">
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Slide sebelumnya"
                  className="p-1 hover:text-[#D9AC61] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Slide berikutnya"
                  className="p-1 hover:text-[#D9AC61] transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Mobile Pagination Dots */}
            <div className="md:hidden absolute bottom-2 left-0 right-0 z-30 flex justify-center items-center gap-1.5 pointer-events-none">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? "w-5 bg-[#D9AC61]"
                      : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
