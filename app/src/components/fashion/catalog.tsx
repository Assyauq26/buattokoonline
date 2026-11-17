"use client";
import Link from "next/link";
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import { ChevronDown, ChevronUp, ImageIcon, Search } from "lucide-react";
import { formatIDR } from "@/lib/money";
import type { FashionFrame } from "@/modules/catalog/fashion-catalog";
import { fashionWindow } from "@/modules/catalog/fashion-window";
import { readCatalogPosition } from "@/modules/catalog/fashion-navigation";
import { previewRead } from "@/components/appearance/preview-request";
import {
  compositionDefaults,
  type StoreAppearanceV1,
} from "@/modules/appearance/schema";
import { fashionImage } from "@/modules/catalog/fashion-image";
import { Cover } from "./cover";
import { offsetFrom, orbitStyle } from "./orbit";
import { useOrbit } from "./use-orbit";

export function fashionUrl(id: string, index: number) {
  return "/?" + new URLSearchParams({ koleksi: id, posisi: String(index + 1) });
}

type Props = { frame: FashionFrame; previewConfig?: StoreAppearanceV1 };
export function FashionCatalog({ frame: initial, previewConfig }: Props) {
  return (
    <CatalogEntry
      key={JSON.stringify([
        initial.collection?.id,
        initial.index,
        initial.cards.map((c) => c.id),
      ])}
      initial={initial}
      previewConfig={previewConfig}
    />
  );
}
// Native history updates the address during a drag. The App Router can restore
// a previously cached server frame when returning from a product.
function CatalogEntry({
  initial,
  previewConfig,
}: {
  initial: FashionFrame;
  previewConfig?: StoreAppearanceV1;
}) {
  const [restored, setRestored] = useState<FashionFrame | null>(null);
  useLayoutEffect(() => {
    if (previewConfig) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("koleksi");
    const raw = url.searchParams.get("posisi");
    if (!id || !raw || !/^\d+$/.test(raw)) return;
    const pos = Number(raw) - 1;
    if (
      !Number.isSafeInteger(pos) ||
      pos < 0 ||
      (id === initial.collection?.id && pos === initial.index)
    )
      return;
    if (
      id === initial.collection?.id &&
      fashionWindow(initial.total, pos).every((s) =>
        initial.cards.some((c) => c.pos === s.pos),
      )
    ) {
      setRestored({ ...initial, index: Math.min(initial.total - 1, pos) });
      return;
    }
    let cancelled = false;
    void readCatalogPosition(id, pos)
      .then((frame) => {
        if (!cancelled && location.href === url.href) setRestored(frame);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial, previewConfig]);
  return (
    <CatalogSession
      key={restored ? "restored" : "initial"}
      initial={restored ?? initial}
      previewConfig={previewConfig}
    />
  );
}

function CatalogSession({
  initial,
  previewConfig,
}: {
  initial: FashionFrame;
  previewConfig?: StoreAppearanceV1;
}) {
  const [frame, setFrame] = useState(initial);
  const [index, setIndex] = useState(initial.index);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const [pending, setPending] = useState(false);
  const { cards, collections, total } = frame;
  const collection =
    previewConfig?.collections?.find((c) => c.id === frame.collection?.id) ??
    frame.collection;
  const active = cards.find((c) => c.pos === index);
  const initialHero = useRef(
    initial.index === 0 && initial.collection?.backgroundId
      ? "/api/v1/" +
          (previewConfig ? "admin/" : "") +
          "store-branding/" +
          initial.collection.backgroundId
      : (initial.index === 0 && initial.collection?.cover) ||
          initial.cards.find((c) => c.pos === initial.index)?.image,
  );
  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );
  async function go(id: string, pos: number) {
    const request = ++seq.current;
    setPicker(false);
    setError("");
    setPending(true);
    try {
      const result = previewConfig
        ? await previewRead<FashionFrame>({ type: "fashion-position", id, pos })
        : await readCatalogPosition(id, pos);
      if (request !== seq.current) return;
      setFrame(result);
      setIndex(result.index);
      if (!previewConfig && result.collection)
        window.history.replaceState(
          null,
          "",
          fashionUrl(result.collection.id, result.index),
        );
    } catch {
      if (request === seq.current) setError("Koleksi gagal dimuat. Coba lagi.");
    } finally {
      if (request === seq.current) setPending(false);
    }
  }
  function select(pos: number) {
    if (!collection || pos === index) return;
    setIndex(pos);
    if (!previewConfig)
      window.history.replaceState(null, "", fashionUrl(collection.id, pos));
    const buffered = fashionWindow(total, pos, 3).every((slot) =>
      cards.some((card) => card.pos === slot.pos),
    );
    if (!buffered) void go(collection.id, pos);
    else {
      seq.current++;
      setPending(false);
      setError("");
    }
  }
  function switchCollection(delta: number) {
    if (!collection || collections.length < 2) return;
    void go(
      collections[
        (collections.findIndex((c) => c.id === collection.id) +
          delta +
          collections.length) %
          collections.length
      ].id,
      0,
    );
  }
  if (!collection || !active)
    return (
      <section className="fashion-empty">
        <h1>Belum ada koleksi</h1>
        <p>Produk akan tampil di sini saat koleksi tersedia.</p>
        <Link href="/shop?sort=newest">Jelajahi katalog</Link>
      </section>
    );
  return (
    <CatalogView
      key={collection.id}
      {...{
        collection,
        collections,
        total,
        cards,
        index,
        active,
        select,
        go,
        switchCollection,
        preview: !!previewConfig,
        picker,
        setPicker,
        pending,
        error,
      }}
      initialHero={initialHero.current || null}
    />
  );
}
type ViewProps = {
  collection: NonNullable<FashionFrame["collection"]>;
  collections: FashionFrame["collections"];
  total: number;
  cards: FashionFrame["cards"];
  index: number;
  active: FashionFrame["cards"][number];
  select: (pos: number) => void;
  go: (id: string, pos: number) => void;
  switchCollection: (d: number) => void;
  preview: boolean;
  picker: boolean;
  setPicker: (s: boolean) => void;
  pending: boolean;
  error: string;
  initialHero: string | null;
};
function CatalogView({
  collection,
  collections,
  total,
  cards,
  index,
  active,
  select,
  go,
  switchCollection,
  preview,
  picker,
  setPicker,
  pending,
  error,
  initialHero,
}: ViewProps) {
  const [highlight, setHighlight] = useState(index);
  const visible = cards.find((card) => card.pos === highlight) ?? active;
  const orbit = useOrbit({
    index,
    total,
    positions: cards.map((c) => c.pos),
    select,
    highlight: setHighlight,
    category: switchCollection,
  });
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!preview) return;
    const ids = [collection.backgroundId, collection.cutoutId].filter(
      (x): x is string => !!x,
    );
    let cancelled = false;
    const urls: Record<string, string> = {};
    void Promise.all(
      ids.map(async (id) => {
        const bytes = await previewRead<ArrayBuffer>({
          type: "fashion-asset",
          id,
        });
        if (!cancelled)
          urls[id] = URL.createObjectURL(
            new Blob([bytes], { type: "image/webp" }),
          );
      }),
    )
      .then(() => {
        if (!cancelled) setBlobs(urls);
      })
      .catch(() => {
        if (!cancelled) setBlobs({});
      });
    return () => {
      cancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [preview, collection.backgroundId, collection.cutoutId]);
  const brand = (id: string) =>
    preview ? blobs[id] : "/api/v1/store-branding/" + id;
  const background =
    visible.pos === 0 &&
    collection.backgroundId &&
    brand(collection.backgroundId);
  const photo =
    background || (visible.pos === 0 && collection.cover) || visible.image;
  const object =
    collection.cutoutId && background ? brand(collection.cutoutId) : undefined;
  const placement = (mode: "desktop" | "mobile") => {
    const p = collection[mode] ?? compositionDefaults[mode];
    return {
      ["--" + mode + "-x"]: p.x + "%",
      ["--" + mode + "-y"]: p.y + "%",
      ["--" + mode + "-scale"]: p.scale + "%",
    };
  };
  const lead = !preview && initialHero && fashionImage(initialHero, true);
  return (
    <section
      className="fashion-stage"
      aria-label="Katalog koleksi"
      aria-busy={pending}
      onPointerDown={orbit.down}
      onPointerMove={orbit.move}
      onPointerUp={(e) => orbit.end(e)}
      onPointerCancel={(e) => orbit.end(e, true)}
      onLostPointerCapture={(e) => orbit.end(e, true)}
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (e.detail && orbit.blockClick.current) {
          e.preventDefault();
          e.stopPropagation();
          orbit.blockClick.current = false;
        }
      }}
      style={
        {
          "--fashion-mobile-focus": collection.mobileFocus + "%",
          "--fashion-desktop-focus": collection.desktopFocus + "%",
          ...placement("mobile"),
          ...placement("desktop"),
        } as CSSProperties
      }
    >
      {lead && (
        <link
          rel="preload"
          as="image"
          href={lead.src}
          imageSrcSet={lead.srcSet}
          imageSizes={lead.sizes}
          fetchPriority="high"
        />
      )}
      <Cover photo={photo} fallback={visible.image} object={object} />
      {error && (
        <p className="fashion-fetch-error" role="status">
          {error}
        </p>
      )}
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
      <div className="fashion-orbit-window">
        <div
          className="fashion-carousel"
          ref={orbit.stage}
          aria-label="Jelajahi produk"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
            ) {
              e.preventDefault();
              if (e.key === "ArrowLeft") orbit.step(-1);
              if (e.key === "ArrowRight") orbit.step(1);
              if (e.key === "ArrowDown") switchCollection(1);
              if (e.key === "ArrowUp") switchCollection(-1);
            }
          }}
        >
          {cards.map((card) => {
            if (Math.abs(offsetFrom(card.pos, visible.pos, total)) > 2)
              return null;
            const current = card.pos === visible.pos,
              offset = offsetFrom(card.pos, index, total);
            const desktop = orbitStyle(offset, total, false),
              mobile = orbitStyle(offset, total, true);
            return (
              <article
                key={card.id}
                className="fashion-slide"
                data-pos={card.pos}
                data-active={current}
                data-offset={offset}
                style={
                  {
                    "--initial-orbit": desktop.transform,
                    "--initial-orbit-mobile": mobile.transform,
                    opacity: desktop.opacity,
                    zIndex: desktop.zIndex,
                  } as CSSProperties
                }
              >
                <Link
                  href={
                    current
                      ? "/product/" + encodeURIComponent(card.slug)
                      : fashionUrl(collection.id, card.pos)
                  }
                  prefetch={false}
                  draggable={false}
                  tabIndex={current ? 0 : -1}
                  aria-label={(current ? "Lihat " : "Pilih ") + card.name}
                  onClick={(e) => {
                    if (!current || preview) {
                      e.preventDefault();
                      if (!current) orbit.choose(card.pos);
                      return;
                    }
                    try {
                      sessionStorage.setItem(
                        "fashion-return",
                        fashionUrl(collection.id, index),
                      );
                    } catch {}
                  }}
                >
                  <span className="fashion-shot">
                    {card.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        {...fashionImage(card.image, card.image === initialHero)}
                        loading={current ? "eager" : "lazy"}
                        draggable={false}
                        alt={card.name}
                      />
                    ) : (
                      <ImageIcon aria-label="Foto belum tersedia" />
                    )}
                  </span>
                  {current && (
                    <span className="fashion-caption">
                      <strong>{card.name}</strong>
                      <span>{formatIDR(card.price)}</span>
                    </span>
                  )}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
      <div className="fashion-meta">
        <div className="fashion-count" aria-live="polite">
          {String(visible.pos + 1).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
          <progress value={visible.pos + 1} max={total} />
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
