import { customerRefundView } from "@/lib/customer-refund-view";
import Link from "next/link";
import { PayOrderLink } from "@/components/storefront/pay-order-link";
import { ArrowLeft, Search, Clock, Truck, Info } from "lucide-react";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { CustomerOrderTabs } from "@/components/storefront/customer-order-tabs";
import { listCustomerOrderPage } from "@/modules/orders/orders.service";
import { customerTabs, customerCanPay } from "@/lib/customer-order-view";
import { formatIDR } from "@/lib/money";
import { orderFlow } from "@/modules/orders/flow-state";
import "./orders.css";
export const dynamic = "force-dynamic";
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const user = await getCurrentUserBasic();
  if (!user)
    return (
      <Link href="/login?redirectTo=/orders">Masuk untuk melihat pesanan</Link>
    );
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 200),
    tab = customerTabs.some((t) => t.key === params.tab) ? params.tab : "all";
  const result = await listCustomerOrderPage(user.id, {
    tab: tab || "all",
    q,
    page: Math.min(
      100000,
      Math.max(1, Number.parseInt(params.page || "1", 10) || 1),
    ),
  });
  const { orders, counts } = result;
  return (
    <div className="customer-orders">
      <header>
        <Link href="/account" aria-label="Kembali ke akun">
          <ArrowLeft />
        </Link>
        <h1>Pesanan Saya</h1>
      </header>
      <form className="customer-order-search" role="search" aria-label="Pencarian pesanan">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari nama produk atau nomor pesanan"
          aria-label="Cari pesanan"
        />
        <input type="hidden" name="tab" value={tab} />
        <button type="submit" aria-label="Cari">
          <Search size={20} aria-hidden="true" />
        </button>
      </form>
      <CustomerOrderTabs tab={tab || "all"} q={q} counts={counts} />
      <div className="customer-order-list">
        {orders.map((o) => {
          const it = o.items[0],
            verify =
              o.status === "PENDING_PAYMENT" &&
              o.paymentStatus === "WAITING_VERIFICATION",
            unpaid = customerCanPay(o),
            shipped = o.status === "SHIPPED";
          const refunds = o.resolutions
            .map(customerRefundView)
            .filter((r) => r.approved);
          return (
            <article key={o.id} data-testid={`order-row-${o.orderNumber}`}>
              <div className="customer-order-top">
                <strong>{o.orderNumber}</strong>
                <span data-tone={orderFlow(o).tone}>{orderFlow(o).label}</span>
              </div>
              <div className="customer-order-product">
                <div className="customer-order-image">
                  {it?.imageUrl ? (
                    <img src={it.imageUrl} alt={it.productName} />
                  ) : null}
                </div>
                <div>
                  <h2>{it?.productName || "Produk pesanan"}</h2>
                  <p>{it?.variantLabel}</p>
                  <p>
                    ×{it?.quantity}
                    {o.items.length > 1
                      ? ` · +${o.items.length - 1} produk`
                      : ""}
                  </p>
                </div>
                <div className="customer-order-total">
                  <span>Total</span>
                  <strong>{formatIDR(o.total)}</strong>
                </div>
              </div>
              {refunds.length > 0 && (
                <p className="customer-order-note">
                  <Info size={18} />
                  {[...new Set(refunds.map((r) => r.label))].join(" · ")}
                </p>
              )}
              {(verify || unpaid || shipped) && (
                <p className="customer-order-note">
                  {shipped ? <Truck size={18} /> : <Clock size={18} />}{" "}
                  {verify
                    ? "Bukti pembayaran sedang diperiksa"
                    : unpaid
                      ? o.expiresAt
                        ? `Bayar sebelum ${o.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`
                        : "Selesaikan pembayaran untuk melanjutkan."
                      : `${o.shippingCourier} · Dalam perjalanan`}
                </p>
              )}
              <div className="customer-order-actions">
                <Link href={`/orders/${o.id}`}>
                  {verify ? "Lihat detail" : "Detail"}
                </Link>
                {unpaid && (
                  <PayOrderLink
                    orderId={o.id}
                    correction={o.payment?.status === "REJECTED"}
                  />
                )}{" "}
                {shipped && (
                  <Link className="primary" href={`/orders/${o.id}#tracking`}>
                    Lacak pesanan
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!orders.length && (
        <p className="py-12 text-center text-zinc-500">
          {tab === "cancelled"
            ? "Tidak ada pesanan dibatalkan yang sesuai."
            : "Tidak ada pesanan yang sesuai."}
        </p>
      )}
      <footer className="customer-order-pagination">
        <span>{result.total} pesanan</span>
        {result.page > 1 && (
          <Link
            href={`/orders?tab=${tab}&q=${encodeURIComponent(q)}&page=${result.page - 1}`}
          >
            Sebelumnya
          </Link>
        )}
        {result.page < result.pages && (
          <Link
            href={`/orders?tab=${tab}&q=${encodeURIComponent(q)}&page=${result.page + 1}`}
          >
            Berikutnya
          </Link>
        )}
      </footer>
    </div>
  );
}
