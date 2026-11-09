import { orderWorkflowStyle } from "@/modules/orders/order-workflow-theme";
import "../orders.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Truck,
  MapPin,
  Phone,
  UserRound,
  Clock,
  ClipboardList,
} from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getOrderById } from "@/modules/orders/orders.service";
import { formatIDR } from "@/lib/money";
import {
  orderDisplayStatus,
  paymentDisplayStatus,
  ORDER_STATUS_LABEL,
} from "@/lib/order-status";
import {
  fulfillmentLabel,
  terminalResolutionStates,
} from "@/modules/orders/resolution-policy";
import { resolutionView } from "@/modules/orders/resolution.service";
import { JntOrderPanel } from "@/components/admin/jnt-order-panel";
import { CopyValue } from "@/components/admin/copy-value";
import { OperationForm } from "@/components/admin/operation-form";
import { ShipmentForm } from "@/components/admin/shipment-form";
import { manualShipmentOptions } from "@/modules/shipping/shipping-policy";
import { activeRefund } from "@/modules/payments/refund-state";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const when = (d: Date) =>
  d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await requireBackofficeUser(PERMISSIONS.ORDER_READ),
    { id } = await params,
    o = await getOrderById(id);
  if (!o) notFound();
  const has = (p: string) => a.permissions.includes(p),
    p = o.payment,
    s = o.shipment,
    r = o.jntShipmentRequest;
  const view = await resolutionView(id, { id: a.id, staff: true }),
    active = view.cases.find(
      (c) => !terminalResolutionStates.includes(c.state),
    ),
    legacy = p ? await activeRefund(prisma, p.id) : null,
    hold = !!active || !!legacy,
    refunded = o.paymentStatus === "REFUNDED" && p?.status === "REFUNDED";
  const next =
    !refunded && o.status === "PAID"
      ? "PROCESSING"
      : !refunded && o.status === "PROCESSING"
        ? "PACKED"
        : null;
  const phase =
    refunded && ["PAID", "PROCESSING", "PACKED"].includes(o.status)
      ? -1
      : ["PAID", "PROCESSING", "PACKED"].includes(o.status)
        ? 1
        : ["SHIPPED", "DELIVERED"].includes(o.status)
          ? 2
          : o.status === "COMPLETED"
            ? 3
            : -1;
  const shipping = fulfillmentLabel({
    requestState: r?.state,
    errorCode: r?.errorCode,
    cancelledAt: s?.cancelledAt,
    sellerHandoverAt: s?.sellerHandoverAt,
    shipmentStatus: s?.status,
    carrierEventAt: s?.carrierEventAt,
  });
  const cancelable =
    !view.leftWarehouse &&
    !["CANCELLED", "EXPIRED", "REFUNDED"].includes(o.status);
  return (
    <div
      className="order-workflow order-detail"
      style={await orderWorkflowStyle()}
    >
      <Link className="flow-back" href="/admin/orders">
        <ArrowLeft size={20} /> Kembali ke pesanan
      </Link>
      <header className="order-detail-header">
        <h1>Detail pesanan</h1>
        <div className="flow-button-row">
          <strong>{o.orderNumber}</strong>
          <CopyValue value={o.orderNumber} label="Salin nomor pesanan" />
        </div>
        <p>{when(o.createdAt)}</p>
      </header>
      <div className="order-detail-badges">
        <span className="flow-status">
          {hold
            ? "Kasus perlu diselesaikan"
            : refunded && ["PAID", "PROCESSING", "PACKED"].includes(o.status)
              ? "Refund selesai · Periksa pengiriman"
              : ["PACKED", "SHIPPED"].includes(o.status)
                ? shipping
                : orderDisplayStatus(o.status, o.paymentStatus)}
        </span>
        <span>{paymentDisplayStatus(o.paymentStatus)}</span>
      </div>
      {phase >= 0 && (
        <ol className="order-progress" aria-label="Progres pesanan">
          {["Dibayar", "Diproses", "Dikirim", "Selesai"].map((l, i) => (
            <li key={l} data-active={i <= phase}>
              <span />
              {l}
            </li>
          ))}
        </ol>
      )}
      <div className="flow-columns">
        <div>
          <section className="order-panel order-next">
            <Package size={28} />
            <div>
              <h2>Langkah berikutnya</h2>
              {active ? (
                <>
                  <p>
                    Pembatalan, retur, atau refund aktif. Pemenuhan ditunda;
                    informasi tracking tetap dicatat.
                  </p>
                  <Link
                    className="flow-primary"
                    href={`/admin/orders/${id}/resolution?case=${active.id}`}
                  >
                    Lanjutkan penanganan kasus
                  </Link>
                </>
              ) : legacy ? (
                <Link
                  className="flow-secondary"
                  href={`/admin/orders/${id}/legacy-refund`}
                >
                  Lanjutkan ledger refund sebelumnya
                </Link>
              ) : (
                <>
                  <p>
                    {o.status === "CANCELLED" && refunded
                      ? "Pesanan dibatalkan dan dana telah dikembalikan. Tidak ada pengiriman yang perlu disiapkan."
                      : refunded
                        ? "Dana sudah dikembalikan. Periksa tracking untuk memastikan pembatalan atau kondisi paket; jangan siapkan pengiriman baru."
                        : p?.status === "WAITING_VERIFICATION"
                          ? "Periksa bukti dan dana masuk sebelum menyetujui pembayaran."
                          : next
                            ? "Periksa produk dan alamat, lalu siapkan paket."
                            : o.status === "PACKED"
                              ? "Periksa data pengiriman, buat resi, dan cetak AWB sebelum menyerahkan paket."
                              : o.status === "SHIPPED"
                                ? "Pantau perjalanan paket. Tracking diperiksa setiap hari."
                                : o.status === "DELIVERED"
                                  ? "Paket terkirim. Penyelesaian mengikuti konfirmasi pembeli atau tindakan eksplisit yang tersedia."
                                  : "Lihat pembayaran dan aktivitas pesanan."}
                  </p>
                  {next && has(PERMISSIONS.ORDER_UPDATE) && (
                    <OperationForm
                      url={`/api/v1/admin/orders/${id}/status`}
                      label={
                        next === "PROCESSING"
                          ? "Mulai proses"
                          : "Paket selesai disiapkan"
                      }
                      confirmation="Produk dan kondisi pesanan sudah diperiksa?"
                      fields={[
                        {
                          name: "status",
                          label: "Status",
                          type: "hidden",
                          value: next,
                        },
                      ]}
                    />
                  )}{" "}
                  {p?.status === "WAITING_VERIFICATION" &&
                    has(PERMISSIONS.PAYMENT_READ) && (
                      <Link
                        className="flow-primary"
                        href={`/admin/orders/${id}/payment`}
                      >
                        Verifikasi pembayaran
                      </Link>
                    )}
                  {o.status === "PACKED" && !refunded && (
                    <a className="flow-primary" href="#order-shipping">
                      Siapkan pengiriman
                    </a>
                  )}
                </>
              )}
            </div>
          </section>
          <section id="order-shipping" className="order-panel">
            <h2>
              <Truck size={21} /> Pengiriman
            </h2>
            <p className="flow-muted">
              Berat paket:{" "}
              {o.shippingWeightGram
                ? `${o.shippingWeightGram} gram`
                : "Periksa berat produk sebelum membuat resi"}{" "}
              · Layanan: {o.shippingService || "Belum dipilih"}
            </p>
            {has(PERMISSIONS.SHIPPING_READ) ? (
              <>
                <JntOrderPanel
                  orderId={id}
                  isOfficial={
                    o.shippingMode === "official" || s?.provider === "jnt"
                  }
                  service={o.shippingService}
                  status={o.status}
                  hasPaid={o.paymentStatus === "PAID" && p?.status === "PAID"}
                  canCreate={!hold && has(PERMISSIONS.SHIPPING_CREATE)}
                  fulfillmentHeld={hold || refunded}
                  canUpdate={has(PERMISSIONS.SHIPPING_UPDATE)}
                  canRead
                  requestState={r?.state || null}
                  errorCode={r?.errorCode}
                  externalOrderId={r?.externalOrderId}
                  awb={r?.awb || null}
                  shipmentStatus={s?.status || null}
                  carrierCondition={s?.carrierCondition}
                  sellerHandoverAt={!!s?.sellerHandoverAt}
                />
                {!s?.cancelledAt &&
                  s?.carrierCondition !== "NONE" &&
                  s?.carrierCondition && (
                    <p className="flow-warning">
                      {s.carrierCondition === "RETURNING"
                        ? "Paket dalam proses retur oleh kurir"
                        : s.carrierCondition === "RETURNED"
                          ? "Kurir mencatat paket dikembalikan. Gudang tetap perlu memeriksa barang."
                          : "Ada kendala pengiriman. Periksa detail tracking."}
                    </p>
                  )}
                {o.shippingMode !== "official" && s?.provider !== "jnt" && (
                  <>
                    <p>
                      {o.shippingCourier} · {o.shippingService} ·{" "}
                      {s?.trackingNumber || "Resi belum tersedia"}
                    </p>
                    {has(PERMISSIONS.SHIPPING_UPDATE) && (
                      <ShipmentForm
                        orderId={id}
                        orderStatus={o.status}
                        initial={s}
                        allowed={
                          hold
                            ? []
                            : manualShipmentOptions({
                                status: o.status,
                                paymentStatus: o.paymentStatus,
                                paymentStatusActual: p?.status,
                                shipmentStatus: s?.status || null,
                              })
                        }
                      />
                    )}
                  </>
                )}
                {s?.events.length ? (
                  <details>
                    <summary>Riwayat tracking</summary>
                    <ol className="flow-history">
                      {s.events.map((e) => (
                        <li key={e.id}>
                          <p>
                            {e.description.replace(/^J&T\s+\d+\s*·\s*/, "")}
                          </p>
                          <time>{when(e.occurredAt)}</time>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {!!o.jntShipmentAttempts.length && (
                  <details>
                    <summary>
                      Resi sebelumnya ({o.jntShipmentAttempts.length})
                    </summary>
                    {o.jntShipmentAttempts.map((at) => (
                      <p key={at.id}>
                        {at.awb} · dibatalkan · {when(at.archivedAt)}
                      </p>
                    ))}
                  </details>
                )}
              </>
            ) : (
              <p>Izin pengiriman diperlukan.</p>
            )}
          </section>
          <section className="order-panel">
            <h2>
              <Package size={21} /> Produk pesanan
            </h2>
            <ul className="order-products">
              {o.items.map((i) => (
                <li key={i.id}>
                  <div className="order-thumb">
                    {i.imageUrl ? (
                      <img src={i.imageUrl} alt={i.productName} />
                    ) : (
                      <Package />
                    )}
                  </div>
                  <div>
                    <strong>{i.productName}</strong>
                    <p>
                      {i.variantLabel} · {i.quantity} pcs
                    </p>
                  </div>
                  <strong>{formatIDR(i.lineTotal)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <details className="order-panel" open>
            <summary>
              <ClipboardList size={20} /> Total pesanan{" "}
              <strong>{formatIDR(o.total)}</strong>
            </summary>
            <dl className="flow-totals">
              {[
                ["Subtotal", o.subtotal],
                ["Diskon", o.discount],
                ["Ongkir", o.shippingCost],
                ["Total", o.total],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{formatIDR(Number(v))}</dd>
                </div>
              ))}
            </dl>
            {p && has(PERMISSIONS.PAYMENT_READ) && (
              <Link
                href={`/admin/orders/${id}/payment`}
                className="flow-secondary"
              >
                Lihat pembayaran &amp; bukti transfer
              </Link>
            )}
          </details>
        </div>
        <aside>
          <section className="order-panel">
            <h2>Penerima</h2>
            {o.address && (
              <address className="not-italic">
                <strong>
                  <UserRound size={17} />
                  {o.address.recipientName}
                </strong>
                <p>
                  <Phone size={17} />
                  {o.address.phone}
                </p>
                <p>
                  <MapPin size={17} />
                  {[
                    o.address.line,
                    o.address.village,
                    o.address.district,
                    o.address.city,
                    o.address.province,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </address>
            )}
            {o.note && <p>Catatan: {o.note}</p>}
          </section>
          <section className="order-panel">
            <h2>Pembatalan, retur &amp; refund</h2>
            {view.cases.map((c) => (
              <Link
                className="flow-secondary"
                key={c.id}
                href={`/admin/orders/${id}/resolution?case=${c.id}`}
              >
                {c.kind === "CANCEL" ? "Pembatalan" : "Retur / refund"} ·{" "}
                {c.refundAmount > 0 ? formatIDR(c.refundAmount) : c.reason} →
              </Link>
            ))}
            {!hold && cancelable && has(PERMISSIONS.ORDER_CANCEL) && (
              <Link
                className="flow-secondary"
                href={`/admin/orders/${id}/resolution?mode=CANCEL`}
              >
                Batalkan pesanan
              </Link>
            )}
            {!hold &&
              !cancelable &&
              !refunded &&
              s?.provider === "jnt" &&
              s.status === "PENDING" &&
              r?.state === "SUCCEEDED" &&
              has(PERMISSIONS.SHIPPING_UPDATE) && (
                <a className="flow-secondary" href="#order-shipping">
                  Batalkan resi sebelum membatalkan pesanan
                </a>
              )}
            {!hold &&
              view.paid &&
              view.leftWarehouse &&
              has(PERMISSIONS.PAYMENT_VERIFY) && (
                <Link
                  className="flow-secondary"
                  href={`/admin/orders/${id}/resolution`}
                >
                  Buat kasus retur / refund
                </Link>
              )}
            <p className="flow-muted">
              Pembatalan resi tersedia di bagian Pengiriman pada halaman ini.
              Pembatalan transaksi tidak otomatis mengembalikan uang.
            </p>
          </section>
          <details className="order-panel">
            <summary>
              <Clock size={20} /> Aktivitas pesanan
            </summary>
            <ol className="flow-history">
              {o.history.map((h) => (
                <li key={h.id}>
                  <strong>{ORDER_STATUS_LABEL[h.toStatus]}</strong>
                  <p>{h.note}</p>
                  <time>{when(h.createdAt)}</time>
                </li>
              ))}
            </ol>
          </details>
          <details className="order-panel">
            <summary>Bantuan</summary>
            <p>
              Verifikasi dana, siapkan paket, buat resi, lalu catat penyerahan.
              Status kurir mengikuti tracking. Dana refund dicatat setelah
              transfer manual; pembeli mengonfirmasi penerimaannya.
            </p>
          </details>
        </aside>
      </div>
    </div>
  );
}
