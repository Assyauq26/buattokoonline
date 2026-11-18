"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShoppingBag, Check } from "lucide-react";
import { CART_COUNT_EVENT } from "@/modules/cart/cart-events";

export interface DenimProduct {
  id: string;
  name: string;
  slug: string;
  categoryName?: string;
  price: number;
  image: string;
  isNew?: boolean;
}

export const DEFAULT_PRODUCTS: DenimProduct[] = [
  {
    id: "baggy-black",
    name: "Street.id Baggy Jeans",
    categoryName: "Black Denim",
    slug: "baggy-jeans-black-denim",
    price: 299000,
    image: "/themes/dark-jeans/product-baggy-black.jpg",
    isNew: true,
  },
  {
    id: "wide-leg-blue",
    name: "Street.id Wide Leg Jeans",
    categoryName: "Vintage Blue",
    slug: "wide-leg-jeans-vintage-blue",
    price: 219000,
    image: "/themes/dark-jeans/product-wide-vintage-blue.jpg",
    isNew: true,
  },
  {
    id: "straight-grey",
    name: "Street.id Straight Jeans",
    categoryName: "Dark Grey Denim",
    slug: "straight-jeans-dark-grey-denim",
    price: 299000,
    image: "/themes/dark-jeans/product-straight-dark-grey.jpg",
    isNew: true,
  },
  {
    id: "loose-washed",
    name: "Street.id Loose Jeans",
    categoryName: "Blue Washed",
    slug: "loose-jeans-blue-washed",
    price: 299000,
    image: "/themes/dark-jeans/product-loose-blue-washed.jpg",
    isNew: true,
  },
  {
    id: "light-blue",
    name: "Street.id Relaxed Jeans",
    categoryName: "Light Blue Washed",
    slug: "relaxed-jeans-light-blue",
    price: 279000,
    image: "/themes/dark-jeans/product-light-blue.jpg",
    isNew: true,
  },
  {
    id: "acid-wash",
    name: "Street.id Acid Wash Jeans",
    categoryName: "Charcoal Snow Wash",
    slug: "acid-wash-jeans-charcoal",
    price: 319000,
    image: "/themes/dark-jeans/product-acid-wash.jpg",
    isNew: true,
  },
  {
    id: "ice-blue",
    name: "Cloth X Street Baggy",
    categoryName: "Ice Blue Denim",
    slug: "cloth-x-street-baggy-ice-blue",
    price: 289000,
    image: "/themes/dark-jeans/product-ice-blue.jpg",
    isNew: true,
  },
];

function formatRupiah(value: number) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(value);
}

export function DarkJeansNewArrival({
  products = DEFAULT_PRODUCTS,
}: {
  products?: DenimProduct[];
}) {
  const [addedMap, setAddedMap] = React.useState<Record<string, boolean>>({});

  const displayProducts = products.length > 0 ? products.slice(0, 4) : DEFAULT_PRODUCTS;

  const handleQuickAdd = (p: DenimProduct, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Trigger instant optimistic feedback
    setAddedMap((prev) => ({ ...prev, [p.id]: true }));
    window.dispatchEvent(
      new CustomEvent(CART_COUNT_EVENT, { detail: { delta: 1 } })
    );

    setTimeout(() => {
      setAddedMap((prev) => ({ ...prev, [p.id]: false }));
    }, 1200);
  };

  return (
    <section className="w-full py-14 lg:py-20 bg-[#0B0B0E] relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-0 w-72 h-72 bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="space-y-2">
            <span className="text-xs font-mono font-bold tracking-widest text-[#E5A93C] uppercase">
              ///// NEW ARRIVAL
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight uppercase font-display">
              New Arrival{" "}
              <span className="text-[#E5A93C]">Premium Denim</span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg">
              Koleksi terbaru dengan kualitas terbaik untuk gaya lebih percaya diri.
            </p>
          </div>

          <Link href="/shop" className="dj-btn-pill shrink-0">
            <span>SHOP NOW</span>
            <ArrowRight size={15} className="text-[#E5A93C]" />
          </Link>
        </div>

        {/* 4 Product Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {displayProducts.map((p) => {
            const isAdded = !!addedMap[p.id];

            return (
              <div key={p.id} className="dj-card flex flex-col group">
                <Link href={`/product/${p.slug}`} className="block relative">
                  {/* Studio Image with NEW badge */}
                  <div className="dj-card-image-wrap">
                    <span className="dj-badge-new">NEW</span>
                    <Image
                      src={p.image}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="dj-card-image"
                    />
                  </div>
                </Link>

                {/* Card Content & Action */}
                <div className="p-4 flex flex-col flex-1 justify-between gap-3 bg-[#13151D]">
                  <div>
                    <Link
                      href={`/product/${p.slug}`}
                      className="text-sm font-bold text-white hover:text-[#E5A93C] transition-colors line-clamp-1"
                    >
                      {p.name}
                    </Link>
                    {p.categoryName && (
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                        {p.categoryName}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-sm font-extrabold text-[#E5A93C] font-mono">
                      {formatRupiah(p.price)}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleQuickAdd(p, e)}
                      className={`dj-card-btn ${
                        isAdded ? "!bg-[#E5A93C] !text-[#0B0B0E]" : ""
                      }`}
                      aria-label={`Tambah ${p.name} ke keranjang`}
                    >
                      {isAdded ? (
                        <Check size={15} strokeWidth={2.5} />
                      ) : (
                        <ShoppingBag size={15} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
