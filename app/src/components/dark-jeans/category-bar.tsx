"use client";

import React from "react";
import Link from "next/link";
import { renderCategoryIcon } from "@/modules/catalog/category-icon-registry";

export interface CategoryData {
  id?: string;
  name: string;
  slug: string;
  iconKey?: string | null;
}

const PREVIEW_CATEGORIES: CategoryData[] = [
  { id: "cat-1", name: "Baggy Jeans", slug: "baggy-jeans", iconKey: "baggy-jeans" },
  { id: "cat-2", name: "Loose Jeans", slug: "loose-jeans", iconKey: "loose-jeans" },
  { id: "cat-3", name: "Wide Leg Jeans", slug: "wide-leg-jeans", iconKey: "wide-leg-jeans" },
  { id: "cat-4", name: "Straight Jeans", slug: "straight-jeans", iconKey: "straight-jeans" },
  { id: "cat-5", name: "Denim Collection", slug: "denim-collection", iconKey: "collection" },
];

export function DarkJeansCategoryBar({
  categories = [],
  preview = false,
}: {
  categories?: CategoryData[];
  preview?: boolean;
}) {
  const items =
    categories.length > 0 ? categories : preview ? PREVIEW_CATEGORIES : [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="w-full py-3 sm:py-5 bg-[#080808]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="bg-[#111111] border border-[#D9AC61]/25 rounded-xl sm:rounded-2xl shadow-xl overflow-hidden">
          
          {/* DESKTOP: Side-by-side icon and label with vertical dividers */}
          <div className="hidden md:grid md:grid-flow-col md:auto-cols-fr divide-x divide-white/5">
            {items.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="group flex items-center justify-center gap-3 px-4 py-3.5 text-zinc-300 hover:text-[#D9AC61] hover:bg-white/[0.02] transition-all"
              >
                <div className="w-6 h-6 shrink-0 transition-transform duration-200 group-hover:scale-110 text-[#D9AC61]">
                  {renderCategoryIcon(cat.iconKey, {
                    className: "w-6 h-6",
                    color: "currentColor",
                  })}
                </div>
                <span className="text-xs font-semibold tracking-wide whitespace-nowrap">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>

          {/* MOBILE: Icon above label, compact horizontal scroll strip */}
          <div className="md:hidden flex items-stretch overflow-x-auto no-scrollbar divide-x divide-white/5 py-1">
            {items.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="group flex flex-col items-center justify-center gap-1.5 px-3 py-2 text-center shrink-0 min-w-[76px] sm:min-w-[90px] text-zinc-300 hover:text-[#D9AC61] transition-all"
              >
                <div className="w-6 h-6 flex items-center justify-center text-[#D9AC61] transition-transform duration-200 group-hover:scale-105">
                  {renderCategoryIcon(cat.iconKey, {
                    className: "w-5 h-5",
                    color: "currentColor",
                  })}
                </div>
                <span className="text-[10px] font-medium leading-tight line-clamp-2 max-w-[80px]">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
