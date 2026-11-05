import Link from "@/components/ui/navigation";
import {
  Shirt,
  Footprints,
  ShoppingBag,
  Watch,
  Layers,
  MoveVertical,
  HardHat,
  Glasses,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  shirt: Shirt,
  footprints: Footprints,
  "shopping-bag": ShoppingBag,
  watch: Watch,
  layers: Layers,
  "move-vertical": MoveVertical,
  "hard-hat": HardHat,
  glasses: Glasses,
};

export function CategoryNav({
  categories,
}: {
  categories: { name: string; slug: string; iconKey: string | null }[];
}) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1" data-testid="category-nav">
      {categories.map((c) => {
        const Icon = ICONS[c.iconKey ?? ""] ?? Shirt;
        return (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            data-testid={`category-${c.slug}`}
            className="flex min-w-[84px] flex-col items-center gap-2"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface transition-colors hover:bg-line">
              <Icon size={24} className="text-ink" />
            </span>
            <span className="text-xs font-medium text-ink-soft">{c.name}</span>
          </Link>
        );
      })}
      <Link href="/shop" className="flex min-w-[84px] flex-col items-center gap-2" data-testid="category-all">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface hover:bg-line">
          <ChevronRight size={24} className="text-ink" />
        </span>
        <span className="text-xs font-medium text-ink-soft">Lihat Semua</span>
      </Link>
    </div>
  );
}
