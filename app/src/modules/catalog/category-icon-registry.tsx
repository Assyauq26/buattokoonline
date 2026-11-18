import React from "react";
import {
  BaggyJeansIcon,
  LooseJeansIcon,
  WideLegJeansIcon,
  StraightJeansIcon,
  DenimCollectionIcon,
} from "@/components/dark-jeans/icons";
import {
  Shirt,
  ShoppingBag,
  Watch,
  Layers,
  Footprints,
  Glasses,
  HardHat,
  Tag,
  Sparkles,
  Scissors,
  Bookmark,
  Gem,
  Package,
} from "lucide-react";

export interface CategoryIconDefinition {
  key: string;
  label: string;
  group: "Denim & Jeans" | "Atasan" | "Bawahan" | "Fashion & Aksesoris" | "Umum";
  render: (props: { className?: string; color?: string }) => React.ReactNode;
}

export const CATEGORY_ICON_REGISTRY: CategoryIconDefinition[] = [
  // 1. Denim & Jeans
  {
    key: "baggy-jeans",
    label: "Baggy Jeans",
    group: "Denim & Jeans",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <BaggyJeansIcon className={className} color={color} />
    ),
  },
  {
    key: "loose-jeans",
    label: "Loose Jeans",
    group: "Denim & Jeans",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <LooseJeansIcon className={className} color={color} />
    ),
  },
  {
    key: "wide-leg-jeans",
    label: "Wide Leg Jeans",
    group: "Denim & Jeans",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <WideLegJeansIcon className={className} color={color} />
    ),
  },
  {
    key: "straight-jeans",
    label: "Straight Jeans",
    group: "Denim & Jeans",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <StraightJeansIcon className={className} color={color} />
    ),
  },
  {
    key: "slim-fit-jeans",
    label: "Slim Fit Jeans",
    group: "Denim & Jeans",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 40 40" fill="none" className={className}>
        <path
          d="M15 5H25L25.5 10L25 35H21.5L20.3 17H19.7L18.5 35H15L14.5 10L15 5Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M15 10H25" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" />
      </svg>
    ),
  },
  {
    key: "cargo-pants",
    label: "Cargo Pants",
    group: "Denim & Jeans",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 40 40" fill="none" className={className}>
        <path
          d="M13 5H27L28 10L29 35H23L20.5 17H19.5L17 35H11L12 10L13 5Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <rect x="9" y="19" width="3" height="5" rx="0.5" stroke={color} strokeWidth="1.2" />
        <rect x="28" y="19" width="3" height="5" rx="0.5" stroke={color} strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    key: "trousers",
    label: "Celana Panjang / Trousers",
    group: "Bawahan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 40 40" fill="none" className={className}>
        <path
          d="M14 6H26L26.5 11L28 35H23L20.5 17H19.5L17 35H12L13.5 11L14 6Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "skirt",
    label: "Rok / Skirt",
    group: "Bawahan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 40 40" fill="none" className={className}>
        <path
          d="M15 7H25L31 33H9L15 7Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M15 12H25" stroke={color} strokeWidth="1.2" />
      </svg>
    ),
  },

  // 2. Atasan
  {
    key: "shirt",
    label: "Kemeja / Shirt",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Shirt className={className} stroke={color} />
    ),
  },
  {
    key: "t-shirt",
    label: "Kaos / T-Shirt",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 6L8 3H16L20 6L18 10L15 8V21H9V8L6 10L4 6Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "blouse",
    label: "Blus / Blouse",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M6 4L9 2H15L18 4L21 8L17 10L16 22H8L7 10L3 8L6 4Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "women-top",
    label: "Atasan Wanita",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M7 4L12 8L17 4L20 7L17 10L16 21H8L7 10L4 7L7 4Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "men-top",
    label: "Atasan Pria",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 6L8 3H16L19 6L17 10L15 9V21H9V9L7 10L5 6Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "jacket",
    label: "Jaket / Jacket",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Layers className={className} stroke={color} />
    ),
  },
  {
    key: "hoodie",
    label: "Hoodie / Sweater",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M9 3C9 3 12 1 15 3L19 6L17 10L15 9V21H9V9L7 10L5 6L9 3Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 9V14" stroke={color} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "cardigan",
    label: "Cardigan / Outer",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 5L9 2H15L19 5L17 9L15 8V21H9V8L7 9L5 5Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <line x1="12" y1="8" x2="12" y2="21" stroke={color} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "knitwear",
    label: "Rajut / Knitwear",
    group: "Atasan",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 6L8 3H16L20 6L18 10L15 9V21H9V9L6 10L4 6Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M10 12L14 14M14 12L10 14M10 16L14 18M14 16L10 18" stroke={color} strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    key: "dress",
    label: "Gaun / Dress",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M9 3L12 6L15 3L18 6L15 11L19 22H5L9 11L6 6L9 3Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "hijab",
    label: "Hijab / Jilbab",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 2C8 2 6 5 6 9C6 14 4 19 3 22H21C20 19 18 14 18 9C18 5 16 2 12 2Z"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10" r="3.5" stroke={color} strokeWidth="1.5" />
      </svg>
    ),
  },

  // 3. Sepatu & Tas
  {
    key: "shoes",
    label: "Sepatu / Shoes",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Footprints className={className} stroke={color} />
    ),
  },
  {
    key: "sandals",
    label: "Sandal / Footwear",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <ellipse cx="12" cy="14" rx="5" ry="8" stroke={color} strokeWidth="1.8" />
        <path d="M8 12L12 16L16 12" stroke={color} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "bag",
    label: "Tas / Bag",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <ShoppingBag className={className} stroke={color} />
    ),
  },
  {
    key: "watch",
    label: "Jam Tangan / Watch",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Watch className={className} stroke={color} />
    ),
  },
  {
    key: "accessories",
    label: "Aksesori / Perhiasan",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Gem className={className} stroke={color} />
    ),
  },
  {
    key: "glasses",
    label: "Kacamata / Eyewear",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Glasses className={className} stroke={color} />
    ),
  },
  {
    key: "hat",
    label: "Topi / Headwear",
    group: "Fashion & Aksesoris",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <HardHat className={className} stroke={color} />
    ),
  },

  // 4. Koleksi & Umum
  {
    key: "collection",
    label: "Koleksi Denim / General Collection",
    group: "Umum",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <DenimCollectionIcon className={className} color={color} />
    ),
  },
  {
    key: "hanger",
    label: "Hanger Pakaian",
    group: "Umum",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 4C10.5 4 9.5 5 9.5 6.5C9.5 8 11 9 12 10L3 17H21L12 10"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "sparkles",
    label: "Produk Pilihan / Unggulan",
    group: "Umum",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Sparkles className={className} stroke={color} />
    ),
  },
  {
    key: "tag",
    label: "Promo & Diskon",
    group: "Umum",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Tag className={className} stroke={color} />
    ),
  },
  {
    key: "package",
    label: "Paket & Bundel",
    group: "Umum",
    render: ({ className = "w-6 h-6", color = "currentColor" }) => (
      <Package className={className} stroke={color} />
    ),
  },
];

export function getCategoryIconDefinition(key: string | null | undefined): CategoryIconDefinition {
  if (!key) {
    return CATEGORY_ICON_REGISTRY.find((i) => i.key === "collection") || CATEGORY_ICON_REGISTRY[0];
  }
  const clean = key.toLowerCase().trim();
  const direct = CATEGORY_ICON_REGISTRY.find((i) => i.key === clean);
  if (direct) return direct;

  // Safe fallback to collection
  return CATEGORY_ICON_REGISTRY.find((i) => i.key === "collection") || CATEGORY_ICON_REGISTRY[0];
}

export function renderCategoryIcon(
  key: string | null | undefined,
  options?: { className?: string; color?: string },
) {
  const def = getCategoryIconDefinition(key);
  return def.render({ className: options?.className, color: options?.color });
}
