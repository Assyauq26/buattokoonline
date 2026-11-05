import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts, getBrandBySlug } from "@/modules/catalog/catalog.service";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

type BrandRouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<BrandRouteProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  return {
    title: brand ? brand.name : "Brand",
    alternates: { canonical: `/brand/${slug}` },
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: BrandRouteProps) {
  const { slug } = await params;
  const { sort: sortParam, page: pageParam } = await searchParams;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  const user = await getCurrentUserBasic();
  const sort = (sortParam as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({ brandSlug: slug, sort, page: Number(pageParam) || 1, pageSize: 24 }),
    user ? wishlistProductIds(user.id) : Promise.resolve([]),
  ]);

  return (
    <ProductListing
      title={brand.name}
      items={result.items}
      total={result.total}
      wishlisted={new Set(wishIds)}
      basePath={`/brand/${slug}`}
      currentSort={sort}
      currentPage={result.page}
      pageSize={result.pageSize}
    />
  );
}
