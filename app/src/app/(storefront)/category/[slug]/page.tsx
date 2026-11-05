import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts, getCategoryBySlug } from "@/modules/catalog/catalog.service";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const dynamic = "force-dynamic";

type CategoryRouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<CategoryRouteProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  return {
    title: cat ? `Kategori ${cat.name}` : "Kategori",
    description: cat ? `Belanja produk kategori ${cat.name} di toko ini.` : undefined,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryRouteProps) {
  const { slug } = await params;
  const { sort: sortParam, page: pageParam } = await searchParams;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();
  const user = await getCurrentUserBasic();
  const sort = (sortParam as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({ categorySlug: slug, sort, page: Number(pageParam) || 1, pageSize: 24 }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={cat.name}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath={`/category/${slug}`}
      currentSort={sort}
      currentPage={result.page}
      pageSize={result.pageSize}
    />
  );
}
