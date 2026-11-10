import { orderFlow } from "@/modules/orders/flow-state";
import { CompleteOrderButton } from "@/components/storefront/complete-order-button";
import { shipmentHasLeftWarehouse } from "@/modules/shipping/jnt-cancellation-policy";
import { reviewableOrderItems } from "@/modules/reviews/reviews.service";
import Link from "next/link";
import Image from "next/image";
import { HttpError } from "@/lib/response";
import { notFound, redirect } from "next/navigation";
import {
  MapPin,
  Truck,
  CreditCard,
  ChevronLeft,
  PackageX,
  Clock,
  MessageSquare,
  ClipboardList,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrderForUser } from "@/modules/orders/orders.service";
import { formatIDR } from "@/lib/money";
import { formatAddressLocality } from "@/lib/address-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { paymentDisplayStatus } from "@/lib/order-status";
import { CopyValue } from "@/components/admin/copy-value";
import { resolutionView } from "@/modules/orders/resolution.service";
import { customerRefundView } from "@/lib/customer-refund-view";
import { getPublishedAppearance } from "@/modules/appearance/published";
import { normalizeWhatsApp } from "@/lib/store-contact";
import "../customer-detail.css";

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
  const activeCase = order.resolutions.some(
    (c) => !["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"].includes(c.state),
  );
  const leftWarehouse = shipmentHasLeftWarehouse({
    orderStatus: order.status,
    requestState: order.jntShipmentRequest?.state,
    shipment: order.shipment,
  });
  const refunds = (await resolutionView(id, { id: user.id, staff: false }))
    .cases;
  const { config } = await getPublishedAppearance();
  const phone = config.identity.showWhatsApp
    ? normalizeWhatsApp(config.identity.whatsapp)
    : null;
  const cancelled = ["CANCELLED", "REFUNDED", "EXPIRED"].includes(order.status);

  return (
    <div className="customer-order-detail mx-auto max-w-3xl">
      <Link href="/orders" className="customer-back">
        <ChevronLeft size={18} /> Kembali ke pesanan
      </Link>

      <header className="customer-detail-heading">
        <h1>Detail pesanan</h1>
        <p>
          {order.orderNumber}
          <CopyValue
            value={order.orderNumber}
            label="Salin nomor pesanan"
          /> ·{" "}
          {new Date(order.createdAt).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          })}{" "}
          WIB
        </p>
      </header>
      <section className="customer-panel customer-order-state">
        <h2 className="customer-icon-heading">
          {cancelled && <PackageX size={24} />}{" "}
          {cancelled
            ? order.status === "EXPIRED"
              ? "Pesanan kedaluwarsa"
              : "Pesanan dibatalkan"
            : orderFlow(order).label}
        </h2>
        <p>
          {cancelled
            ? refunds.find((c) => c.kind === "CANCEL")?.reason
              ? `Penjual membatalkan karena ${refunds.find((c) => c.kind === "CANCEL")!.reason}.`
              : "Pesanan tidak dilanjutkan."
            : orderFlow(order).description}
        </p>
        {refunds
          .filter((c) => c.state !== "CANCELLED_NO_REFUND")
          .map((c) => {
            const ui = customerRefundView(c);
            return (
              <div className="customer-refund-notice" key={c.id}>
                <h3 className="customer-icon-heading">
                  <Clock size={20} />
                  {ui.needsBank ? "Penjual akan mengembalikan dana" : ui.label}
                </h3>
                {ui.approved && (
                  <strong className="refund-amount">
                    {formatIDR(c.refundAmount)}
                  </strong>
                )}
                <p>{ui.description}</p>
                <Link
                  className="customer-secondary"
                  href={`/orders/${id}/resolution?case=${c.id}`}
                >
                  {ui.needsBank
                    ? "Isi rekening pengembalian"
                    : ui.approved
                      ? "Lihat pengembalian dana"
                      : "Lihat permintaan"}
                </Link>
              </div>
            );
          })}
      </section>
      {order.status === "DELIVERED" && !activeCase && (
        <CompleteOrderButton orderId={id} />
      )}
      {order.paymentStatus === "PAID" && leftWarehouse && !activeCase && (
        <Link
          className="block rounded-xl border p-4 underline"
          href={`/orders/${id}/resolution`}
        >
          Ajukan retur / refund
        </Link>
      )}
      {needPayment && order.status === "PENDING_PAYMENT" && (
        <div className="flex items-center justify-between rounded-2xl border border-warning/40 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            {order.payment?.status === "REJECTED"
              ? "Perbaiki bukti pembayaran. Jangan membayar ulang sebelum toko memeriksa dana masuk."
              : "Selesaikan pembayaran pesananmu."}
          </p>
          <Button asChild size="sm">
            <Link href={`/checkout/payment/${order.id}`}>
              {order.payment?.status === "REJECTED"
                ? "Perbaiki bukti"
                : "Bayar sekarang"}
            </Link>
          </Button>
        </div>
      )}

      {order.payment?.status === "REJECTED" &&
        order.payment.confirmations[0]?.rejectionReason && (
          <p role="status" className="rounded-xl border p-4">
            Alasan perbaikan: {order.payment.confirmations[0].rejectionReason}
          </p>
        )}
      {orderFlow(order).operation && (
        <p role="status">{orderFlow(order).operation}</p>
      )}
      {/* Items */}
      <section className="customer-panel">
        <div className="customer-products-heading">
          <h2>Produk pesanan</h2>
          <span>
            {order.items.length} produk ·{" "}
            {order.items.reduce((n, i) => n + i.quantity, 0)} pcs
          </span>
        </div>
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
                    {it.variantLabel}
                    <br />
                    {it.quantity} × {formatIDR(it.unitPrice)}
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
            <span>Total pembayaran</span>
            <span>{formatIDR(order.total)}</span>
          </div>
        </div>
      </section>

      {/* Shipping tracking */}
      {order.shipment && !order.shipment.cancelledAt && (
        <section id="tracking" className="rounded-2xl border border-line p-4">
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
                  {e.description.replace(/^J&T\s+\d+\s*·\s*/, "")}
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
      <div className="customer-detail-accordions">
        {order.payment && (
          <details className="customer-panel customer-accordion">
            <summary>
              <CreditCard size={18} />
              Pembayaran &amp; bukti transfer
            </summary>
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
            {order.payment.confirmations.map((proof) => (
              <a
                key={proof.id}
                className="customer-secondary"
                href={`/api/v1/payments/proof?id=${proof.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Lihat bukti pembayaran
              </a>
            ))}
          </details>
        )}
        {order.address && (
          <details className="customer-panel customer-accordion">
            <summary>
              <MapPin size={18} />
              Alamat penerima
            </summary>
            <p className="text-sm font-semibold text-ink">
              {order.address.recipientName}
            </p>
            <p className="text-sm text-ink-soft">{order.address.phone}</p>
            <p className="text-sm text-ink-soft">
              {order.address.line}, {locality && `${locality}, `}
              {order.address.city}, {order.address.province}{" "}
              {order.address.postalCode}
            </p>
          </details>
        )}
      </div>
      <details className="customer-panel customer-accordion">
        <summary>
          <ClipboardList size={18} /> Riwayat pesanan
          {order.shipment?.cancelledAt && (
            <small>Pengiriman dibatalkan · Resi tidak aktif</small>
          )}
        </summary>
        <ol>
          {order.history.map((h) => (
            <li key={h.id}>
              <p>
                {h.note
                  ?.replace(/seller/gi, "penjual")
                  .replace(/kasus/gi, "permintaan") ||
                  orderFlow({
                    status: h.toStatus,
                    paymentStatus: order.paymentStatus,
                  }).label}
              </p>
              <small>
                {new Date(h.createdAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta",
                })}{" "}
                WIB
              </small>
            </li>
          ))}
        </ol>
      </details>
      {phone && (
        <a
          className="customer-secondary"
          href={`https://wa.me/${phone}?text=${encodeURIComponent(`Halo, saya ingin menanyakan pesanan ${order.orderNumber}.`)}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageSquare size={18} />
          Hubungi toko
        </a>
      )}
    </div>
  );
}
