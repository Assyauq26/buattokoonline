import Link from "next/link";
import { Heart } from "lucide-react";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { getWishlistView } from "@/modules/wishlist/wishlist.service";
import { ProductCard, toCardData } from "@/components/storefront/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const user = await getCurrentUserBasic();
  if (!user) {
    return (
      <EmptyState
        icon={<Heart size={40} />}
        title="Masuk untuk melihat wishlist"
        description="Simpan produk yang kamu suka untuk dibeli nanti."
        action={<Button asChild><Link href="/login?redirectTo=/wishlist">Masuk</Link></Button>}
      />
    );
  }
  const items = await getWishlistView(user.id);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink md:text-3xl">Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={<Heart size={40} />}
          title="Wishlist masih kosong"
          description="Tekan ikon hati pada produk untuk menyimpannya."
          action={<Button asChild><Link href="/shop">Jelajahi Produk</Link></Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {items.map((it) => (
            <ProductCard key={it.id} product={toCardData(it.product)} wishlisted />
          ))}
        </div>
      )}
    </div>
  );
}
