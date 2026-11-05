import { publicCampaign } from "@/modules/promotions/campaign-pricing";
import { FlashSaleTimer } from "@/components/storefront/flash-sale-timer";
import { ProductListing } from "@/components/storefront/product-listing";
import { listProducts } from "@/modules/catalog/catalog.service";
import { getStorefrontUserContext } from "@/lib/auth/session";
import { wishlistProductIds } from "@/modules/wishlist/wishlist.service";

export const metadata = {
  title: "Shop",
  description: "Jelajahi seluruh koleksi toko ini.",
};

type ShopPageProps = {
  searchParams: Promise<{
    q?: string;
    flash?: string;
    sort?: string;
    page?: string;
  }>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const wishIdsPromise = getStorefrontUserContext().then((user) =>
    user ? wishlistProductIds(user.id) : [],
  );
  const sort =
    (params.sort as "newest" | "price_asc" | "price_desc") ?? "newest";
  const [result, wishIds] = await Promise.all([
    listProducts({
      search: params.q,
      flashSale: params.flash === "1",
      sort,
      page: Number(params.page) || 1,
      pageSize: 12,
    }),
    wishIdsPromise,
  ]);

  const campaign = params.flash === "1" ? await publicCampaign() : null;
  return (
    <div className="space-y-5">
      {params.flash === "1" &&
        (campaign ? (
          <section
            aria-label="Jadwal Flash Sale"
            className="rounded-xl border border-line p-4"
          >
            <h1 className="mb-3 text-xl font-bold">{campaign.name}</h1>
            <FlashSaleTimer campaign={campaign} />
          </section>
        ) : (
          <p className="py-4 text-sm text-ink-soft">
            Belum ada kampanye Flash Sale.
          </p>
        ))}
      <ProductListing
        title={params.flash === "1" ? "Flash Sale" : "Semua Produk"}
        items={result.items}
        total={result.total}
        wishlisted={new Set(wishIds)}
        basePath="/shop"
        currentSort={sort}
        currentPage={result.page}
        pageSize={result.pageSize}
        query={{
          ...(params.q ? { q: params.q } : {}),
          ...(params.flash ? { flash: "1" } : {}),
        }}
      />
    </div>
  );
}
