"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "@/components/ui/navigation";
import { ArrowRight } from "lucide-react";

export interface HeroSlide {
  image: string;
  mobileImage?: string;
  alt?: string;
  heading?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  align?: "left" | "center" | "right";
  tone?: "light" | "dark";
  overlay?: number;
}

function SlideAction({ slide, preview }: { slide: HeroSlide; preview: boolean }) {
  if (!slide.ctaLabel || !slide.ctaHref) return null;
  const className = "mt-2 inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm";
  const style = { backgroundColor: "var(--store-primary, #111111)", color: "var(--store-primaryText, #FFFFFF)" };
  return preview
    ? <span className={className} style={style}>{slide.ctaLabel}<ArrowRight size={15}/></span>
    : <Link href={slide.ctaHref} className={className} style={style}>{slide.ctaLabel}<ArrowRight size={15}/></Link>;
}

export function HeroCarousel({ slides, autoplaySeconds = 6, preview = false }: {
  slides: HeroSlide[];
  autoplaySeconds?: number;
  preview?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const total = slides.length;
  useEffect(() => {
    setIndex(i => total ? Math.min(i, total - 1) : 0);
  }, [total]);
  useEffect(() => {
    if (preview || total <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % total), autoplaySeconds * 1000);
    return () => clearInterval(timer);
  }, [total, autoplaySeconds, preview]);
  if (!total) return null;
  const slide = slides[index] ?? slides[0];
  const justify = slide.align === "right" ? "items-end text-right"
    : slide.align === "center" ? "items-center text-center" : "items-start text-left";
  const hasContent = Boolean(slide.heading || slide.description || slide.ctaLabel);
  const tone = slide.tone === "dark" ? "text-zinc-950" : "text-white";
  const darken = Math.min(60, Math.max(0, slide.overlay ?? 0))/100;
  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface" data-testid="hero-carousel" data-theme-target="hero" aria-label="Banner promosi toko">
      <div className={`relative aspect-[16/8] w-full md:aspect-[3/1] ${hasContent ? "md:min-h-[320px]" : ""}`}>
        <picture>
          {slide.mobileImage && <source media="(max-width: 767px)" srcSet={slide.mobileImage} />}
          <Image src={slide.image} alt={slide.alt ?? "Koleksi toko"} fill unoptimized priority
            className="object-cover" sizes="100vw"/>
        </picture>
        {hasContent && (
          /* Normal-flow desktop content grows the hero instead of clipping long copy. */
          <div className={`relative z-10 hidden min-h-[320px] flex-col justify-center gap-2 px-10 py-10 md:flex lg:px-16 ${justify} ${tone}`}
            style={{ background: `rgba(0,0,0,${darken})` }}>
            {slide.heading && <h2 className="max-w-[85%] break-words text-3xl font-extrabold leading-tight lg:text-5xl">{slide.heading}</h2>}
            {slide.description && <p className="max-w-[85%] break-words text-sm font-medium lg:text-lg">{slide.description}</p>}
            <SlideAction slide={slide} preview={preview}/>
          </div>
        )}
        {total > 1 && (
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5" aria-label="Pilihan banner">
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`Tampilkan banner ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${i === index ? "w-6 bg-white" : "w-2 bg-white/60"}`}/>
            ))}
          </div>
        )}
      </div>
      {hasContent && (
        /* Mobile text sits below the image, never behind a fixed-size crop. */
        <div className={`relative z-10 flex flex-col gap-2 px-5 py-5 md:hidden ${justify}`}
          style={{
            backgroundColor: slide.tone === "dark" ? "var(--store-card, #FFFFFF)" : "var(--store-primary, #111111)",
            color: slide.tone === "dark" ? "var(--store-text, #111111)" : "var(--store-primaryText, #FFFFFF)",
          }}>
          {slide.heading && <h2 className="w-full break-words text-xl font-extrabold leading-tight">{slide.heading}</h2>}
          {slide.description && <p className="w-full break-words text-sm leading-relaxed">{slide.description}</p>}
          <SlideAction slide={slide} preview={preview}/>
        </div>
      )}
    </section>
  );
}
