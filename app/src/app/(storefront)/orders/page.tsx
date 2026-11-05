import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { listOrdersForUser } from "@/modules/orders/orders.service";
import { formatIDR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { orderDisplayStatus, orderBadgeVariant } from "@/lib/order-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pesanan Saya", robots: { index: false } };

export default async function OrdersPage() {
  const user = await getCurrentUserBasic();
  if (!user) {
    return (
      <EmptyState
        icon={<Package size={40} />}
        title="Masuk untuk melihat pesanan"
        action={<Button asChild><Link href="/login?redirectTo=/orders">Masuk</Link></Button>}
      />
    );
  }
  const orders = await listOrdersForUser(user.id);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink md:text-3xl">Pesanan Saya</h1>
      {orders.length === 0 ? (
        <EmptyState icon={<Package size={40} />} title="Belum ada pesanan" action={<Button asChild><Link href="/shop">Belanja Sekarang</Link></Button>} />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="block rounded-2xl border border-line p-4 transition-colors hover:bg-surface" data-testid={`order-row-${o.orderNumber}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{o.orderNumber}</span>
                <Badge variant={orderBadgeVariant(o.status)}>{orderDisplayStatus(o.status, o.paymentStatus)}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex -space-x-3">
                  {o.items.slice(0, 3).map((it) => (
                    <div key={it.id} className="relative h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-surface">
                      {it.imageUrl && <Image src={it.imageUrl} alt={it.productName} fill className="object-cover" sizes="48px" />}
                    </div>
                  ))}
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-ink-muted">{o.items.length} item</p>
                  <p className="font-display font-bold text-ink">{formatIDR(o.total)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
