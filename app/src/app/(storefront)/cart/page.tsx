import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { getCartView } from "@/modules/cart/cart.service";
import { CartClient } from "@/components/storefront/cart-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Keranjang" };

export default async function CartPage({searchParams}: {searchParams: Promise<{changed?:string}>}) {
  const {changed}=await searchParams;
  const user = await getCurrentUserBasic();
  if (!user) {
    return (
      <EmptyState
        icon={<ShoppingCart size={40} />}
        title="Masuk untuk melihat keranjang"
        description="Simpan produk favoritmu dan lanjutkan belanja kapan saja."
        action={<Button asChild><Link href="/login?redirectTo=/cart">Masuk</Link></Button>}
      />
    );
  }

  const view = await getCartView(user.id);

  return (
    <div className="space-y-6">
      {changed==="1" && <p role="alert">Isi keranjang berubah. Pilih kembali barang untuk checkout.</p>}
      <h1 className="font-display text-2xl font-black text-ink md:text-3xl">Keranjang</h1>
      {view.lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={40} />}
          title="Keranjang masih kosong"
          description="Yuk temukan produk favoritmu."
          action={<Button asChild><Link href="/shop">Mulai Belanja</Link></Button>}
        />
      ) : (
        <CartClient initial={view} />
      )}
    </div>
  );
}
