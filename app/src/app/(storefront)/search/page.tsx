import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts } from "@/modules/catalog/catalog.service";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = params.q ?? "";
  const user = await getCurrentUserBasic();
  const sort = (params.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({ search: q, sort, page: Number(params.page) || 1, pageSize: 24 }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={q ? `Hasil untuk "${q}"` : "Pencarian"}
      subtitle={`${result.total} produk ditemukan`}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath="/search"
      currentSort={sort}
      currentPage={result.page}
      pageSize={result.pageSize}
      query={q ? { q } : {}}
    />
  );
}
