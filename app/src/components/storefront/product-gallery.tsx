"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useProductSelection } from "./product-selection";

export function ProductGallery({
  images,
  name,
}: {
  images: { url: string; alt: string }[];
  name: string;
}) {
  const selection = useProductSelection();
  const optionImage = selection?.image;
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  // Never pass an empty/unsupported source to Next Image. Keep gallery order
  // and remove failed sources so a broken option/cover falls back to a real photo.
  const seen = new Set<string>();
  const list = (optionImage ? [optionImage, ...images] : images).filter(
    (image) => {
      const url = image.url?.trim();
      if (!url || url !== image.url || failed.includes(url) || seen.has(url))
        return false;
      const local = url.startsWith("/") && !url.startsWith("//");
      let remote = false;
      try {
        remote = new URL(url).protocol === "https:";
      } catch {
        /* Local path. */
      }
      if (!local && !remote) return false;
      seen.add(url);
      return true;
    },
  );
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const previousOption = useRef(optionImage?.url);
  const touchStart = useRef<number | null>(null);
  const focusDot = useRef(false);
  const [keyboardEpoch, setKeyboardEpoch] = useState(0);
  const dotControls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusDot.current) {
      dotControls.current
        ?.querySelector<HTMLButtonElement>('button[aria-current="true"]')
        ?.focus({ preventScroll: true });
      focusDot.current = false;
    }
  }, [active, keyboardEpoch]);
  useEffect(() => {
    if (previousOption.current !== optionImage?.url) {
      previousOption.current = optionImage?.url;
      setActive(0);
    }
  }, [optionImage?.url]);
  // Reset immediately on option changes, before the synchronization effect runs.
  const index =
    previousOption.current !== optionImage?.url
      ? 0
      : Math.min(active, Math.max(0, list.length - 1));
  const displayed = list[index];
  const dotStart = Math.max(0, Math.min(index - 2, list.length - 5));
  const dots = list.length > 5 ? list.slice(dotStart, dotStart + 5) : list;

  function swipe(end: number) {
    if (touchStart.current == null || list.length < 2) return;
    const delta = end - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < 45) return;
    setActive((previous) =>
      Math.max(0, Math.min(list.length - 1, previous + (delta < 0 ? 1 : -1))),
    );
  }

  return (
    <div
      className="pdp-gallery min-w-0"
      data-testid="product-gallery"
      aria-busy={
        !ready || Boolean(displayed && !loaded.includes(displayed.url))
      }
      aria-label="Galeri produk"
    >
      <div
        className="pdp-gallery-frame"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => swipe(event.changedTouches[0]?.clientX ?? 0)}
      >
        {displayed?.url ? (
          <Image
            key={displayed.url}
            src={displayed.url}
            alt={displayed.alt || name}
            fill
            priority={index === 0}
            sizes="(max-width: 767px) 100vw, (max-width: 1280px) 50vw, 560px"
            className="pdp-gallery-image"
            unoptimized={displayed.url.startsWith("/api/v1/product-images/")}
            onLoad={() =>
              setLoaded((previous) =>
                previous.includes(displayed.url)
                  ? previous
                  : [...previous, displayed.url],
              )
            }
            onError={() => {
              setFailed((previous) =>
                previous.includes(displayed.url)
                  ? previous
                  : [...previous, displayed.url],
              );
              setActive(0);
            }}
          />
        ) : (
          <div className="pdp-gallery-empty">Foto produk belum tersedia</div>
        )}
        {displayed && !loaded.includes(displayed.url) && (
          <div className="pdp-gallery-loading" role="status">
            <span>Memuat foto produk…</span>
          </div>
        )}
        {list.length > 1 && (
          <div
            ref={dotControls}
            className="pdp-gallery-dots"
            aria-label="Pilih foto produk"
          >
            {dots.map((image, offset) => {
              const i = list.length > 5 ? dotStart + offset : offset;
              return (
                <button
                  type="button"
                  key={image.url}
                  aria-label={`Lihat foto produk ${i + 1} dari ${list.length}`}
                  aria-current={index === i ? "true" : undefined}
                  onClick={() => setActive(i)}
                  className="grid h-11 w-11 place-items-center rounded-full"
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const key = event.key;
                      focusDot.current = true;
                      setKeyboardEpoch((value) => value + 1);
                      setActive((current) =>
                        key === "Home"
                          ? 0
                          : key === "End"
                            ? list.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  list.length - 1,
                                  current + (key === "ArrowRight" ? 1 : -1),
                                ),
                              ),
                      );
                    }
                  }}
                >
                  <span
                    className="pdp-gallery-dot"
                    aria-current={index === i ? "true" : undefined}
                  />
                </button>
              );
            })}
            {list.length > 5 && (
              <span className="pdp-gallery-counter">
                {index + 1}/{list.length}
              </span>
            )}
          </div>
        )}
      </div>
      {list.length > 1 && (
        <div
          className="pdp-thumb-bar no-scrollbar"
          aria-label="Foto produk lainnya"
        >
          {list.map((image, i) => (
            <button
              type="button"
              key={image.url}
              onClick={() => setActive(i)}
              aria-label={`Lihat foto produk ${i + 1}`}
              aria-pressed={index === i}
              className="pdp-gallery-thumb focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
                unoptimized={image.url.startsWith("/api/v1/product-images/")}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
