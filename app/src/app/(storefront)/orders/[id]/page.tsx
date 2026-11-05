import { reviewableOrderItems } from "@/modules/reviews/reviews.service";
import Link from "next/link";
import Image from "next/image";
import { HttpError } from "@/lib/response";
import { notFound, redirect } from "next/navigation";
import { MapPin, Truck, CreditCard, ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrderForUser } from "@/modules/orders/orders.service";
import { formatIDR } from "@/lib/money";
import { formatAddressLocality } from "@/lib/address-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  orderDisplayStatus,
  orderBadgeVariant,
  paymentDisplayStatus,
} from "@/lib/order-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detail Pesanan", robots: { index: false } };

type OrderDetailRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({
  params,
}: OrderDetailRouteProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=/orders/${id}`);
  const order = await getOrderForUser(user.id, id).catch((error) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  const reviewItems = new Map(
    (await reviewableOrderItems(user.id, id)).map((item) => [item.id, item]),
  );
  const needPayment =
    order.paymentStatus === "PENDING_PAYMENT" ||
    order.payment?.status === "REJECTED";
  const locality = order.address ? formatAddressLocality(order.address) : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/orders"
        className="flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ChevronLeft size={18} /> Kembali ke pesanan
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">
            {order.orderNumber}
          </h1>
          <p className="text-sm text-ink-muted">
            {new Date(order.createdAt).toLocaleString("id-ID")}
          </p>
        </div>
        <Badge variant={orderBadgeVariant(order.status)}>
          {orderDisplayStatus(order.status, order.paymentStatus)}
        </Badge>
      </div>

      {needPayment && (
        <div className="flex items-center justify-between rounded-2xl border border-warning/40 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            Selesaikan pembayaran pesananmu.
          </p>
          <Button asChild size="sm">
            <Link href={`/checkout/payment/${order.id}`}>Bayar Sekarang</Link>
          </Button>
        </div>
      )}

      {/* Items */}
      <section className="rounded-2xl border border-line p-4">
        <h2 className="mb-3 font-display font-bold text-ink">Produk</h2>
        <div className="space-y-3">
          {order.items.map((it) => (
            <div key={it.id} className="flex min-w-0 gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface">
                {it.imageUrl && (
                  <Image
                    src={it.imageUrl}
                    alt={it.productName}
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized={it.imageUrl.startsWith(
                      "/api/v1/product-images/",
                    )}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {it.productName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {it.variantLabel} · {it.quantity}x
                  </p>
                  {reviewItems.get(it.id)?.reviewed ? (
                    <p className="mt-2 text-xs font-semibold">Sudah Diulas</p>
                  ) : (
                    reviewItems.get(it.id)?.eligible && (
                      <Button asChild size="sm" className="mt-2">
                        <Link
                          href={`/orders/${order.id}/review/${it.id}`}
                          data-testid={`review-item-${it.id}`}
                        >
                          Beri Ulasan
                        </Link>
                      </Button>
                    )
                  )}
                </div>
                <span className="text-sm font-semibold">
                  {formatIDR(it.lineTotal)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-soft">Subtotal</span>
            <span>{formatIDR(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Ongkir</span>
            <span>{formatIDR(order.shippingCost)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-soft">Diskon</span>
              <span>- {formatIDR(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-display text-base font-black">
            <span>Total</span>
            <span>{formatIDR(order.total)}</span>
          </div>
        </div>
      </section>

      {/* Shipping tracking */}
      {order.shipment && (
        <section className="rounded-2xl border border-line p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-ink">
            <Truck size={18} /> Pengiriman
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-ink-muted">Kurir</span>
              <p className="font-semibold">
                {order.shipment.courier} - {order.shipment.service}
              </p>
            </div>
            <div>
              <span className="text-ink-muted">No. Resi</span>
              <p className="font-semibold" data-testid="tracking-number">
                {order.shipment.trackingNumber ?? "-"}
              </p>
            </div>
          </div>
          <ol
            className="relative space-y-4 border-l border-line pl-5"
            data-testid="tracking-timeline"
          >
            {order.shipment.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-black" />
                <p className="text-sm font-semibold text-ink">
                  {e.description}
                </p>
                <p className="text-xs text-ink-muted">
                  {new Date(e.occurredAt).toLocaleString("id-ID")}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Address + payment */}
      <div className="grid gap-4 md:grid-cols-2">
        {order.address && (
          <section className="rounded-2xl border border-line p-4">
            <h2 className="mb-2 flex items-center gap-2 font-display font-bold text-ink">
              <MapPin size={18} /> Alamat
            </h2>
            <p className="text-sm font-semibold text-ink">
              {order.address.recipientName}
            </p>
            <p className="text-sm text-ink-soft">{order.address.phone}</p>
            <p className="text-sm text-ink-soft">
              {order.address.line}, {locality && `${locality}, `}{order.address.city},{" "}
              {order.address.province} {order.address.postalCode}
            </p>
          </section>
        )}
        {order.payment && (
          <section className="rounded-2xl border border-line p-4">
            <h2 className="mb-2 flex items-center gap-2 font-display font-bold text-ink">
              <CreditCard size={18} /> Pembayaran
            </h2>
            <p className="text-sm text-ink-soft">Transfer Bank Manual</p>
            <p className="text-sm">
              Status:{" "}
              <Badge
                variant={
                  order.payment.status === "PAID" ? "success" : "warning"
                }
              >
                {paymentDisplayStatus(order.payment.status)}
              </Badge>
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
