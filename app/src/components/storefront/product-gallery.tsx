"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useProductSelection } from "./product-selection";

type Photo = { url: string; alt: string };
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function ProductGallery({ images, name }: { images: Photo[]; name: string }) {
  const [zoom, setZoom] = useState(false);
  const [zoomInstant, setZoomInstant] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  const optionImage = useProductSelection()?.image;
  const track = useRef<HTMLDivElement>(null);
  const fullTrack = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const previousOption = useRef(optionImage?.url);
  const currentIndex = useRef(0);
  const seen = new Set<string>();
  const list = (optionImage ? [optionImage, ...images] : images).filter((image) => {
    const url = image.url?.trim();
    if (!url || url !== image.url || failed.includes(url) || seen.has(url)) return false;
    const local = url.startsWith("/") && !url.startsWith("//");
    let remote = false;
    try { remote = new URL(url).protocol === "https:"; } catch { /* Local path. */ }
    if (!local && !remote) return false;
    seen.add(url);
    return true;
  });
  const index = previousOption.current !== optionImage?.url ? 0 : Math.min(active, Math.max(0, list.length - 1));
  currentIndex.current = index;
  const listKey = list.map((photo) => photo.url).join("\n");
  const count = list.length;

  function position(node: HTMLDivElement | null, target: number, smooth = false) {
    node?.scrollTo?.({ left: target * node.clientWidth, behavior: smooth && !reducedMotion() ? "smooth" : "instant" });
  }
  function navigate(target: number, keyboard = false) {
    const next = Math.max(0, Math.min(count - 1, target));
    setActive(next);
    currentIndex.current = next;
    position(zoom ? fullTrack.current : track.current, next, !keyboard);
  }
  function onKeys(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, currentIndex.current + (event.key === "ArrowRight" ? 1 : -1)));
    navigate(next, true);
    if (!zoom && (event.target as HTMLElement).closest(".pdp-gallery-slide")) {
      (track.current?.children[next] as HTMLElement | undefined)?.focus({ preventScroll: true });
    }
  }
  function onScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    if (!node.clientWidth) return;
    const progress = Math.max(0, Math.min(count - 1, node.scrollLeft / node.clientWidth));
    if (thumb.current) thumb.current.style.transform = `translateX(${progress * 100}%)`;
    const next = Math.round(progress);
    currentIndex.current = next;
    setActive(next);
  }
  useEffect(() => {
    if (previousOption.current !== optionImage?.url) {
      previousOption.current = optionImage?.url;
      currentIndex.current = 0;
    }
    const next = Math.min(currentIndex.current, Math.max(0, count - 1));
    setActive(next);
    position(track.current, next);
    position(fullTrack.current, next);
  }, [optionImage?.url, listKey, count]);
  useEffect(() => {
    if (!zoom) position(track.current, currentIndex.current);
  }, [zoom]);
  useEffect(() => {
    const resize = () => {
      position(track.current, currentIndex.current);
      position(fullTrack.current, currentIndex.current);
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (track.current) observer?.observe(track.current);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  function photo(image: Photo, i: number, fullscreen = false) {
    return <Image
      src={image.url} alt={image.alt || `${name}, foto ${i + 1}`} fill
      priority={!fullscreen && i === 0}
      sizes={fullscreen ? "100vw" : "(max-width: 767px) 100vw, (max-width: 1280px) 50vw, 560px"}
      className="pdp-gallery-image" draggable={false}
      unoptimized={image.url.startsWith("/api/v1/product-images/")}
      onLoad={() => setLoaded((previous) => previous.includes(image.url) ? previous : [...previous, image.url])}
      onError={() => setFailed((previous) => previous.includes(image.url) ? previous : [...previous, image.url])}
    />;
  }

  return <div className="pdp-gallery min-w-0" data-testid="product-gallery" aria-busy={Boolean(list[index] && !loaded.includes(list[index].url))} aria-label="Galeri produk">
    <div className="pdp-gallery-frame">
      <div ref={track} className="pdp-gallery-track" data-testid="product-gallery-track" onScroll={onScroll} onKeyDown={onKeys}
        onPointerDown={(event) => { pointer.current = { x: event.clientX, y: event.clientY, moved: false }; }}
        onPointerMove={(event) => { if (pointer.current && (Math.abs(event.clientX - pointer.current.x) > 8 || Math.abs(event.clientY - pointer.current.y) > 8)) pointer.current.moved = true; }}
        onPointerCancel={() => { if (pointer.current) pointer.current.moved = true; }}>
        {list.map((image, i) => <button type="button" key={image.url} className="pdp-gallery-slide"
          tabIndex={index === i ? 0 : -1} aria-hidden={index !== i || undefined}
          aria-label={`Perbesar foto produk ${i + 1} dari ${count}`}
          onClick={(event) => {
            if (event.detail > 0 && pointer.current?.moved) return;
            trigger.current = event.currentTarget;
            setZoomInstant(event.detail === 0);
            setActive(i); setZoom(true);
          }}>
          {photo(image, i)}
          {!loaded.includes(image.url) && <span className="pdp-gallery-loading" aria-hidden="true" />}
        </button>)}
      </div>
      {!count && <div className="pdp-gallery-empty">Foto produk belum tersedia</div>}
      {Boolean(count) && <>
        <span className="pdp-count" aria-live="polite">{index + 1}/{count}</span>
        {!loaded.includes(list[index].url) && <span role="status" className="sr-only">Memuat foto produk…</span>}
      </>}
    {count > 1 &&
      <div className="pdp-gallery-progress" role="slider" tabIndex={0} aria-label="Pilih foto produk" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1} aria-valuetext={`Foto ${index + 1} dari ${count}`} onKeyDown={onKeys} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); navigate(Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * (count - 1))); }}>
        <span className="pdp-gallery-progress-track"><span ref={thumb} className="pdp-gallery-progress-thumb" style={{ width: `${100 / count}%`, transform: `translateX(${index * 100}%)` }} /></span>
      </div>
    }
    </div>
    {count > 1 && <div className="pdp-thumb-bar no-scrollbar" aria-label="Foto produk lainnya">{list.map((image, i) => <button type="button" key={image.url} onClick={(e) => navigate(i, e.detail === 0)} aria-label={`Lihat foto produk ${i + 1} dari ${count}`} aria-pressed={index === i} className="pdp-gallery-thumb"><Image src={image.url} alt="" fill sizes="64px" className="object-cover" unoptimized={image.url.startsWith("/api/v1/product-images/")} /></button>)}</div>}
    <Dialog.Root open={zoom} onOpenChange={setZoom}>
      <Dialog.Portal>
        <Dialog.Overlay className="pdp-lightbox-backdrop" data-instant={zoomInstant} />
        <Dialog.Content className="pdp-lightbox" data-instant={zoomInstant} aria-describedby={undefined} onKeyDown={onKeys} onEscapeKeyDown={() => setZoomInstant(true)}
          onOpenAutoFocus={() => { requestAnimationFrame(() => position(fullTrack.current, currentIndex.current)); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); const target = track.current?.children[currentIndex.current] as HTMLElement | undefined; (target ?? trigger.current)?.focus({ preventScroll: true }); }}>
          <header className="pdp-lightbox-header"><Dialog.Title>{name}</Dialog.Title><Dialog.Close aria-label="Tutup galeri" className="pdp-lightbox-close"><X size={24} /></Dialog.Close></header>
          <div ref={fullTrack} className="pdp-gallery-track pdp-lightbox-track" data-testid="fullscreen-gallery-track" onScroll={onScroll}>
            {list.map((image, i) => <div key={image.url} className="pdp-gallery-slide" aria-hidden={i !== index || undefined}>{photo(image, i, true)}</div>)}
            {!count && <div className="pdp-gallery-empty">Foto produk belum tersedia</div>}
          </div>
          <footer className="pdp-lightbox-footer">
            <button type="button" aria-label="Foto sebelumnya" disabled={index === 0} onClick={(e) => navigate(index - 1, e.detail === 0)}><ArrowLeft /></button>
            <span aria-live="polite">{count ? index + 1 : 0} / {count}</span>
            <button type="button" aria-label="Foto berikutnya" disabled={index >= count - 1} onClick={(e) => navigate(index + 1, e.detail === 0)}><ArrowRight /></button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
