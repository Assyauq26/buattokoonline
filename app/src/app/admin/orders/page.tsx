import "./orders.css";
import Link from "@/components/ui/navigation";
import { Package, Search } from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { orderWorkflowStyle } from "@/modules/orders/order-workflow-theme";
import {
  sellerOrderPage,
  type OrderPageParams,
} from "@/modules/orders/seller-order-page";
import {
  flowTabs,
  orderFlow,
  summarizeProducts,
} from "@/modules/orders/flow-state";
import { OrderMainAction } from "@/components/admin/order-main-action";
import { OrderFlowTabs } from "@/components/admin/order-flow-tabs";
import { FilterForm } from "@/components/ui/filter-form";
import { OrderFilters } from "@/components/admin/order-filters";
import { PageLinks } from "@/components/admin/operations-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIDR } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<OrderPageParams>;
}) {
  const actor = await requireBackofficeUser(PERMISSIONS.ORDER_READ),
    params = await searchParams;
  const { rows, total, page, pages, counts, tab, q } =
    await sellerOrderPage(params);
  const preserved = Object.fromEntries(
    Object.entries(params).filter(
      (x): x is [string, string] => typeof x[1] === "string" && x[0] !== "page",
    ),
  );
  const url = (extra: Record<string, string>) =>
    "/admin/orders?" +
    new URLSearchParams({ ...preserved, ...extra }).toString();
  const returnTo = url({ tab, ...(params.page ? { page: params.page } : {}) });
  return (
    <div
      className="order-workflow orders-page simple-orders"
      style={await orderWorkflowStyle()}
    >
      <h1>Pesanan</h1>
      <div className="orders-search">
        <FilterForm
          action="/admin/orders"
          className="simple-search"
          role="search"
          key={JSON.stringify(params)}
        >
          <Search size={21} />
          <input
            name="q"
            aria-label="Cari pesanan atau pembeli"
            placeholder="Cari pesanan atau pembeli"
            defaultValue={q}
            maxLength={200}
          />
          {Object.entries({ ...preserved, tab })
            .filter(([k]) => k !== "q")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <button aria-label="Cari pesanan" type="submit">
            <Search size={18} />
          </button>
        </FilterForm>
        <OrderFilters params={{ ...params, tab }} />
      </div>
      <OrderFlowTabs
        tab={tab}
        tabs={flowTabs.map(([key, label]) => ({
          key,
          label,
          href: url({ tab: key, paymentState: "" }),
          count: counts[key],
        }))}
      />
      {tab === "payment" && (
        <nav className="simple-payment-tabs" aria-label="Filter pembayaran">
          {[
            ["", "Semua pembayaran"],
            ["PENDING_PAYMENT", "Menunggu pembayaran"],
            ["WAITING_VERIFICATION", "Menunggu verifikasi"],
            ["REJECTED", "Perlu perbaikan"],
          ].map(([key, label]) => (
            <Link
              key={key}
              aria-current={
                (params.paymentState || "") === key ? "page" : undefined
              }
              href={url({ tab, paymentState: key })}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <div className="order-list-summary">
        <span>{total} pesanan</span>
        <FilterForm action="/admin/orders" className="simple-sort">
          {Object.entries({ ...preserved, tab, q })
            .filter(([k]) => k !== "sort")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label className="sr-only" htmlFor="order-sort">
            Urutan pesanan
          </label>
          <select
            id="order-sort"
            name="sort"
            defaultValue={params.sort || "newest"}
          >
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
          </select>
          <button type="submit" aria-label="Terapkan urutan">
            Urutkan
          </button>
        </FilterForm>
      </div>
      {!rows.length ? (
        <EmptyState
          title="Tidak ada pesanan yang sesuai"
          description="Ubah pencarian atau filter pesanan."
        />
      ) : (
        <ul className="simple-order-list">
          {rows.map((o) => {
            const f = orderFlow(o),
              products = summarizeProducts(o.items),
              href = `/admin/orders/${o.id}?returnTo=${encodeURIComponent(returnTo + "#admin-card-" + o.id)}`;
            return (
              <li
                key={o.id}
                className="compact-order"
                id={"admin-card-" + o.id}
                data-testid={"admin-order-" + o.orderNumber}
              >
                <header>
                  <Link href={href} title={o.orderNumber}>
                    <strong>{o.orderNumber}</strong>
                  </Link>
                  <time dateTime={o.createdAt.toISOString()}>
                    {o.createdAt.toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </header>
                <div className="compact-status">
                  <span className="flow-status" data-tone={f.tone}>
                    {f.label}
                  </span>
                  {f.financial && (
                    <span className="financial-note">{f.financial}</span>
                  )}
                  {f.operation && <small>{f.operation}</small>}
                  {o.jntShipmentRequest?.state === "CANCELLED" &&
                    f.key === "packing" && <small>Perlu resi baru</small>}
                </div>
                <Link
                  href={href}
                  className="compact-products"
                  aria-label={"Detail " + o.orderNumber}
                >
                  <div className="compact-thumbnails">
                    {products.previews.map((i, n) => (
                      <div key={n}>
                        {i.imageUrl ? (
                          <img src={i.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <Package aria-label="Gambar produk tidak tersedia" />
                        )}
                      </div>
                    ))}
                    {products.remaining > 0 && (
                      <div className="thumbnail-more">
                        +{products.remaining}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2>{products.name}</h2>
                    <p>
                      {products.count} produk • {products.units}{" "}
                      {products.units === 1 ? "pc" : "pcs"}
                    </p>
                    <p>{o.address?.recipientName || o.user.name}</p>
                  </div>
                </Link>
                <div className="compact-total">
                  <span>Total</span>
                  <strong>{formatIDR(o.total)}</strong>
                </div>
                <div className="compact-action">
                  <OrderMainAction
                    orderId={o.id}
                    action={f.key === "done" ? "detail" : f.action}
                    label={f.key === "done" ? "Lihat detail" : f.cta}
                    permissions={actor.permissions}
                    official={o.shippingMode === "official"}
                    caseId={f.activeCaseId}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PageLinks
        path="/admin/orders"
        params={{ ...params, tab, q }}
        page={page}
        pages={pages}
      />
    </div>
  );
}
