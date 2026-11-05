import Link from "@/components/ui/navigation";
import { ProductCard, toCardData } from "@/components/storefront/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PackageSearch } from "lucide-react";

// Product listings intentionally receive the lightweight card shape returned by
// catalog.service. Do not use the product detail shape here: it
// includes reviews/questions/category relations that listing queries no longer
// load, which causes both unnecessary payload and a TypeScript mismatch.
type ProductListingItem = Parameters<typeof toCardData>[0];

const SORTS = [
  { key: "newest", label: "Terbaru" },
  { key: "price_asc", label: "Harga Terendah" },
  { key: "price_desc", label: "Harga Tertinggi" },
];

export function ProductListing({
  title,
  subtitle,
  items,
  total,
  wishlisted,
  basePath,
  currentSort,
  currentPage = 1,
  pageSize = 12,
  query = {},
}: {
  title: string;
  subtitle?: string;
  items: ProductListingItem[];
  total: number;
  wishlisted: Set<string>;
  basePath: string;
  currentSort?: string;
  currentPage?: number;
  pageSize?: number;
  query?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const page = Math.min(Math.max(1, currentPage), pages);
  function pageHref(target: number) {
    const p = new URLSearchParams({ ...query, ...(currentSort && currentSort !== "newest" ? { sort: currentSort } : {}), page: String(target) });
    return `${basePath}?${p.toString()}`;
  }
  function sortHref(sort: string) {
    const p = new URLSearchParams({ ...query, sort });
    return `${basePath}?${p.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {subtitle ?? `${total} produk ditemukan`}
          </p>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto" data-testid="sort-bar">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={sortHref(s.key)}
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                (currentSort ?? "newest") === s.key
                  ? "border-black bg-black text-white"
                  : "border-line text-ink-soft hover:bg-surface"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<PackageSearch size={40} />}
          title="Produk tidak ditemukan"
          description="Coba kata kunci lain atau jelajahi kategori kami."
        />
      ) : (
        <div className="product-listing-grid stagger grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={toCardData(p)} wishlisted={wishlisted.has(p.id)} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Halaman produk" className="flex items-center justify-center gap-4 pt-2 text-sm" data-testid="product-pagination">
          {page > 1 ? <Link href={pageHref(page - 1)} className="min-h-11 rounded-lg border border-line px-4 py-3 font-semibold hover:bg-surface">Sebelumnya</Link> : <span className="px-4 text-ink-muted">Sebelumnya</span>}
          <span aria-live="polite">Halaman {page} dari {pages}</span>
          {page < pages ? <Link href={pageHref(page + 1)} className="min-h-11 rounded-lg border border-line px-4 py-3 font-semibold hover:bg-surface">Berikutnya</Link> : <span className="px-4 text-ink-muted">Berikutnya</span>}
        </nav>
      )}
    </div>
  );
}
