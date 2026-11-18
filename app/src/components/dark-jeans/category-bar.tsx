"use client";

import React from "react";
import Link from "next/link";
import {
  BaggyJeansIcon,
  LooseJeansIcon,
  WideLegJeansIcon,
  StraightJeansIcon,
  DenimCollectionIcon,
} from "./icons";
import { Shirt, ShoppingBag, Watch, Layers, Tag } from "lucide-react";

export interface CategoryData {
  id?: string;
  name: string;
  slug: string;
  iconKey?: string | null;
}

const DEFAULT_CATEGORIES: CategoryData[] = [
  { id: "baggy-jeans", name: "Baggy Jeans", slug: "baggy-jeans" },
  { id: "loose-jeans", name: "Loose Jeans", slug: "loose-jeans" },
  { id: "wide-leg-jeans", name: "Wide Leg Jeans", slug: "wide-leg-jeans" },
  { id: "straight-jeans", name: "Straight Jeans", slug: "straight-jeans" },
  { id: "denim-collection", name: "Denim Collection", slug: "denim-collection" },
];

function resolveCategoryIcon(cat: CategoryData) {
  const key = (cat.iconKey || "").toLowerCase();
  const name = cat.name.toLowerCase();
  const slug = cat.slug.toLowerCase();

  if (key === "baggy" || name.includes("baggy") || slug.includes("baggy")) {
    return BaggyJeansIcon;
  }
  if (key === "loose" || name.includes("loose") || slug.includes("loose")) {
    return LooseJeansIcon;
  }
  if (key === "wide" || name.includes("wide") || slug.includes("wide")) {
    return WideLegJeansIcon;
  }
  if (key === "straight" || name.includes("straight") || slug.includes("straight")) {
    return StraightJeansIcon;
  }
  if (
    key === "collection" ||
    name.includes("collection") ||
    slug.includes("collection") ||
    name.includes("denim")
  ) {
    return DenimCollectionIcon;
  }
  if (key === "shirt" || name.includes("baju") || name.includes("kaos") || name.includes("t-shirt")) {
    return ({ className }: { className?: string }) => (
      <Shirt className={className} stroke="#E5A93C" />
    );
  }
  if (key === "jacket" || name.includes("jaket") || name.includes("outer")) {
    return ({ className }: { className?: string }) => (
      <Layers className={className} stroke="#E5A93C" />
    );
  }
  if (key === "watch" || name.includes("aksesoris")) {
    return ({ className }: { className?: string }) => (
      <Watch className={className} stroke="#E5A93C" />
    );
  }
  if (key === "bag" || name.includes("tas")) {
    return ({ className }: { className?: string }) => (
      <ShoppingBag className={className} stroke="#E5A93C" />
    );
  }

  return DenimCollectionIcon;
}

export function DarkJeansCategoryBar({
  categories = [],
  onSelectCategory,
}: {
  categories?: CategoryData[];
  onSelectCategory?: (slug: string) => void;
}) {
  const items = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  return (
    <section className="w-full py-4 sm:py-6 bg-[#0B0B0E]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#111319] border border-[#E5A93C]/25 rounded-2xl shadow-xl overflow-hidden">
          {/* Responsive container: Grid on desktop, horizontal scroll on mobile */}
          <div className="flex md:grid md:grid-flow-col md:auto-cols-fr overflow-x-auto no-scrollbar divide-x divide-white/5">
            {items.map((cat) => {
              const IconComponent = resolveCategoryIcon(cat);
              const href = `/category/${cat.slug}`;

              return (
                <Link
                  key={cat.slug}
                  href={href}
                  onClick={() => onSelectCategory?.(cat.slug)}
                  className="flex flex-col items-center justify-center gap-2 py-3.5 sm:py-4 px-5 min-w-[110px] md:min-w-0 group hover:bg-white/[0.03] transition-colors shrink-0"
                >
                  <div className="w-8 h-8 flex items-center justify-center text-[#E5A93C] transition-transform duration-200 group-hover:scale-110">
                    <IconComponent className="w-7 h-7" color="#E5A93C" />
                  </div>
                  <span className="text-xs font-semibold text-zinc-300 group-hover:text-white tracking-wide transition-colors whitespace-nowrap">
                    {cat.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
