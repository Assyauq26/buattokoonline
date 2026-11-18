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

interface CategoryItem {
  id: string;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string; color?: string }>;
}

const CATEGORIES: CategoryItem[] = [
  {
    id: "baggy-jeans",
    label: "Baggy Jeans",
    href: "/shop?category=baggy-jeans",
    Icon: BaggyJeansIcon,
  },
  {
    id: "loose-jeans",
    label: "Loose Jeans",
    href: "/shop?category=loose-jeans",
    Icon: LooseJeansIcon,
  },
  {
    id: "wide-leg-jeans",
    label: "Wide Leg Jeans",
    href: "/shop?category=wide-leg-jeans",
    Icon: WideLegJeansIcon,
  },
  {
    id: "straight-jeans",
    label: "Straight Jeans",
    href: "/shop?category=straight-jeans",
    Icon: StraightJeansIcon,
  },
  {
    id: "denim-collection",
    label: "Denim Collection",
    href: "/shop",
    Icon: DenimCollectionIcon,
  },
];

export function DarkJeansCategoryBar({
  onSelectCategory,
}: {
  onSelectCategory?: (id: string) => void;
}) {
  return (
    <section className="w-full dj-category-bar">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={cat.href}
              onClick={() => onSelectCategory?.(cat.id)}
              className="dj-category-item group"
            >
              <div className="w-8 h-8 flex items-center justify-center text-zinc-400 group-hover:text-[#E5A93C] transition-colors duration-150">
                <cat.Icon className="w-7 h-7" />
              </div>
              <span className="dj-category-item-text text-zinc-300 group-hover:text-white transition-colors duration-150">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
