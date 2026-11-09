import Link from "next/link";
import { PayOrderLink } from "@/components/storefront/pay-order-link";
import { Package, ArrowLeft, Search, Clock, Truck, Info } from "lucide-react";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { CustomerOrderTabs } from "@/components/storefront/customer-order-tabs";
import { listCustomerOrderPage } from "@/modules/orders/orders.service";
import { customerTabs, customerCanPay } from "@/lib/customer-order-view";
import { formatIDR } from "@/lib/money";
import { orderDisplayStatus } from "@/lib/order-status";
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
      <form className="customer-order-search">
        <Search size={20} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari nama produk atau nomor pesanan"
          aria-label="Cari pesanan"
        />
        <input type="hidden" name="tab" value={tab} />
        <button type="submit" aria-label="Cari">
          <Search size={18} />
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
          return (
            <article key={o.id} data-testid={`order-row-${o.orderNumber}`}>
              <div className="customer-order-top">
                <strong>{o.orderNumber}</strong>
                <span>{orderDisplayStatus(o.status, o.paymentStatus)}</span>
              </div>
              <div className="customer-order-product">
                <div className="customer-order-image">
                  {it?.imageUrl ? (
                    <img src={it.imageUrl} alt={it.productName} />
                  ) : (
                    <Package />
                  )}
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
              {o.resolutions[0] && o.resolutions[0].refundAmount > 0 && (
                <p role="status">
                  {o.resolutions[0].state === "RECEIVED"
                    ? "Refund diterima"
                    : o.resolutions[0].state === "TRANSFER_RECORDED"
                      ? "Refund dicatat seller · konfirmasi penerimaan"
                      : o.resolutions[0].state === "DISPUTED"
                        ? "Refund perlu tindak lanjut"
                        : "Refund perlu diproses"}
                </p>
              )}
              <p className="customer-order-note">
                {unpaid ? (
                  <Clock size={18} />
                ) : shipped ? (
                  <Truck size={18} />
                ) : (
                  <Info size={18} />
                )}{" "}
                {verify
                  ? "Bukti pembayaran sudah diterima"
                  : unpaid
                    ? o.expiresAt
                      ? `Bayar sebelum ${o.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`
                      : "Selesaikan pembayaran untuk melanjutkan."
                    : shipped
                      ? `${o.shippingCourier} · Dalam perjalanan`
                      : orderDisplayStatus(o.status, o.paymentStatus)}
              </p>
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
