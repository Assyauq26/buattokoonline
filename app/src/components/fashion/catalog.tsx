"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Search,
} from "lucide-react";
import { formatIDR } from "@/lib/money";
import type { FashionFrame } from "@/modules/catalog/fashion-catalog";
import { WishlistButton } from "@/components/storefront/wishlist-button";

function Cover({
  src,
  fallback,
}: {
  src: string | null;
  fallback: string | null;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [visible, setVisible] = useState<{
    front: string | null;
    back: string | null;
  }>({ front: null, back: null });
  const requested =
    [src, fallback].find((url) => url && !failed.includes(url)) ?? null;
  const current = useRef(requested);
  current.current = requested;
  // Keep the last decoded image underneath its replacement during the fade.
  const underlay = requested === visible.front ? visible.back : visible.front;
  return (
    <div className="fashion-cover" aria-hidden="true">
      {requested && underlay && underlay !== requested && (
        <Image
          src={underlay}
          alt=""
          fill
          sizes="100vw"
          unoptimized={underlay.startsWith("/api/v1/product-images/")}
        />
      )}
      {requested && (
        <Image
          key={requested}
          src={requested}
          alt=""
          fill
          sizes="100vw"
          priority
          draggable={false}
          unoptimized={requested.startsWith("/api/v1/product-images/")}
          className={visible.front === requested ? "revealed" : "waiting"}
          onError={() => {
            if (current.current === requested)
              setFailed((last) => [...last.slice(-3), requested]);
          }}
          onLoad={() => {
            if (current.current === requested)
              setVisible((last) =>
                last.front === requested
                  ? last
                  : { front: requested, back: last.front },
              );
          }}
        />
      )}
    </div>
  );
}
export function fashionUrl(id: string, index: number) {
  return "/?" + new URLSearchParams({ koleksi: id, posisi: String(index + 1) });
}
export function FashionCatalog({
  frame,
  preview = false,
}: {
  frame: FashionFrame;
  preview?: boolean;
}) {
  const { index, total, cards, collection, collections } = frame;
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [picker, setPicker] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppress = useRef(0);
  const active = cards.find((c) => c.offset === 0);
  function go(id: string, pos: number) {
    setPicker(false);
    if (!preview)
      transition(() => router.replace(fashionUrl(id, pos), { scroll: false }));
  }
  function step(delta: number) {
    if (!collection || total < 2) return;
    const next =
      total === 2
        ? Math.max(0, Math.min(1, index + delta))
        : (index + delta + total) % total;
    if (next !== index) go(collection.id, next);
  }
  function switchCollection(delta: number) {
    if (!collection || collections.length < 2) return;
    go(
      collections[
        (collections.findIndex((c) => c.id === collection.id) +
          delta +
          collections.length) %
          collections.length
      ].id,
      0,
    );
  }
  function finish(e: PointerEvent<HTMLElement>) {
    const start = drag.current;
    if (!start || start.id !== e.pointerId) return;
    drag.current = null;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y,
      x = Math.abs(dx),
      y = Math.abs(dy);
    if (Math.max(x, y) < 12) return;
    suppress.current = performance.now() + 450;
    if (Math.max(x, y) < 32) return;
    if (x > y * 1.2) step(dx < 0 ? 1 : -1);
    else if (y > x * 1.2) switchCollection(dy < 0 ? 1 : -1);
  }
  if (!collection || !active)
    return (
      <section className="fashion-empty">
        <h1>Belum ada koleksi</h1>
        <p>Produk akan tampil di sini saat koleksi tersedia.</p>
        <Link href="/shop?sort=newest">Jelajahi katalog</Link>
      </section>
    );
  function start(e: PointerEvent<HTMLElement>) {
    if (!e.isPrimary) {
      drag.current = null;
      return;
    }
    // A new pointer press is deliberate even immediately after a drag.
    suppress.current = 0;
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest(
        "input,form,button,fieldset,.fashion-meta",
      )
    )
      return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  return (
    <section
      className="fashion-stage"
      aria-label="Katalog koleksi"
      aria-busy={pending}
      onPointerDown={start}
      onPointerMove={(e) => {
        const p = drag.current;
        if (
          p?.id === e.pointerId &&
          Math.max(Math.abs(e.clientX - p.x), Math.abs(e.clientY - p.y)) > 12
        )
          e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onClickCapture={(e) => {
        if (e.detail && performance.now() < suppress.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={
        {
          "--fashion-mobile-focus": collection.mobileFocus + "%",
          "--fashion-desktop-focus": collection.desktopFocus + "%",
        } as CSSProperties
      }
    >
      <Cover src={collection.cover || active.image} fallback={active.image} />
      <div className="fashion-intro">
        <h1>{collection.title}</h1>
        {collection.description && <p>{collection.description}</p>}
        <form action="/search" role="search">
          <button aria-label="Cari koleksi">
            <Search size={19} />
          </button>
          <input
            name="q"
            aria-label="Cari koleksi"
            placeholder="Cari koleksi"
            maxLength={160}
          />
        </form>
      </div>
      <div
        className="fashion-carousel"
        aria-label="Jelajahi produk"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            if (e.key === "ArrowLeft") step(-1);
            if (e.key === "ArrowRight") step(1);
            if (e.key === "ArrowDown") switchCollection(1);
            if (e.key === "ArrowUp") switchCollection(-1);
          }
        }}
      >
        {cards.map((card) => (
          <article
            className="fashion-slide"
            data-offset={card.offset}
            key={card.id}
          >
            <Link
              href={
                card.offset === 0
                  ? "/product/" + encodeURIComponent(card.slug)
                  : fashionUrl(collection.id, card.pos)
              }
              draggable={false}
              replace={card.offset !== 0}
              scroll={card.offset === 0}
              aria-label={
                card.offset === 0 ? "Lihat " + card.name : "Pilih " + card.name
              }
              onClick={(e) => {
                if (preview || card.offset !== 0) {
                  e.preventDefault();
                  if (!preview) go(collection.id, card.pos);
                } else {
                  try {
                    sessionStorage.setItem(
                      "fashion-return",
                      fashionUrl(collection.id, index),
                    );
                  } catch {}
                }
              }}
            >
              <span className="fashion-shot">
                {card.image ? (
                  <Image
                    unoptimized={card.image.startsWith(
                      "/api/v1/product-images/",
                    )}
                    src={card.image}
                    fill
                    sizes="(max-width: 767px) 40vw, 240px"
                    draggable={false}
                    alt={card.name}
                  />
                ) : (
                  <ImageIcon aria-label="Foto belum tersedia" />
                )}
              </span>
              <span className="fashion-caption">
                <strong>{card.name}</strong>
                <span>{formatIDR(card.price)}</span>
              </span>
            </Link>
            {card.offset === 0 && !preview && (
              <span data-favorite>
                <WishlistButton
                  productId={card.id}
                  initialActive={card.favorite}
                />
              </span>
            )}
          </article>
        ))}
        {total > 1 && (
          <>
            {[-1, 1].map((d) => (
              <button
                type="button"
                key={d}
                className="fashion-arrow"
                data-side={d}
                aria-label={d === 1 ? "Produk berikutnya" : "Produk sebelumnya"}
                disabled={total === 2 && (index + d < 0 || index + d >= 2)}
                onClick={() => step(d)}
              >
                {d === 1 ? <ArrowRight /> : <ArrowLeft />}
              </button>
            ))}
          </>
        )}
      </div>
      <div className="fashion-meta">
        <div className="fashion-count" aria-live="polite">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
          <progress value={index + 1} max={total} />
        </div>
        <div className="fashion-collections">
          <button
            type="button"
            aria-expanded={picker}
            onClick={() => setPicker(!picker)}
          >
            {collection.title}
          </button>
          <div>
            <button
              aria-label="Koleksi sebelumnya"
              disabled={collections.length < 2}
              onClick={() => switchCollection(-1)}
            >
              <ChevronUp />
            </button>
            <button
              aria-label="Koleksi berikutnya"
              disabled={collections.length < 2}
              onClick={() => switchCollection(1)}
            >
              <ChevronDown />
            </button>
          </div>
          {picker && (
            <fieldset
              aria-label="Pilih koleksi"
              onKeyDown={(e) => {
                if (e.key === "Escape") setPicker(false);
              }}
            >
              {collections.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={c.id === collection.id}
                  onClick={() => go(c.id, 0)}
                >
                  {c.title}
                </button>
              ))}
            </fieldset>
          )}
        </div>
      </div>
    </section>
  );
}
