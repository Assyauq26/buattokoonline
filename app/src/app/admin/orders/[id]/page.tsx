import "../orders.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Truck,
  UserRound,
  Clock,
  CreditCard,
  Info,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getOrderById } from "@/modules/orders/orders.service";
import { orderFlow } from "@/modules/orders/flow-state";
import { orderWorkflowStyle } from "@/modules/orders/order-workflow-theme";
import { resolutionView } from "@/modules/orders/resolution.service";
import { activeRefund } from "@/modules/payments/refund-state";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/money";
import { paymentDisplayStatus, ORDER_STATUS_LABEL } from "@/lib/order-status";
import { CopyValue } from "@/components/admin/copy-value";
import { OrderMainAction } from "@/components/admin/order-main-action";
import { JntOrderPanel } from "@/components/admin/jnt-order-panel";
import { PaymentVerify } from "@/components/admin/payment-verify";
import { ShipmentForm } from "@/components/admin/shipment-form";
import { manualShipmentOptions } from "@/modules/shipping/shipping-policy";
export const dynamic = "force-dynamic";
const when = (v: Date) =>
  v.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const a = await requireBackofficeUser(PERMISSIONS.ORDER_READ),
    { id } = await params,
    o = await getOrderById(id);
  if (!o) notFound();
  const sp = await searchParams,
    back = sp.returnTo?.startsWith("/admin/orders?")
      ? sp.returnTo
      : "/admin/orders";
  const has = (p: string) => a.permissions.includes(p),
    p = o.payment,
    s = o.shipment,
    r = o.jntShipmentRequest,
    c = p?.confirmations[0],
    f = orderFlow(o);
  const view = await resolutionView(id, { id: a.id, staff: true }),
    legacy = p ? await activeRefund(prisma, p.id) : null,
    hold = !!f.activeCaseId || !!legacy,
    official = o.shippingMode === "official" || s?.provider === "jnt";
  const Icon =
    f.key === "return"
      ? RotateCcw
      : f.key === "done" || f.key === "ready"
        ? CheckCircle2
        : f.key === "shipped"
          ? Truck
          : Clock;
  const phone = o.address?.phone?.replace(/\D/g, "") || "",
    whatsapp = phone.startsWith("0") ? "62" + phone.slice(1) : phone;
  return (
    <div
      className="order-workflow order-detail simple-detail"
      style={await orderWorkflowStyle()}
    >
      <Link href={back} className="flow-back">
        <ArrowLeft size={18} /> Pesanan
      </Link>
      <header className="simple-detail-header">
        <h1>Detail pesanan</h1>
        <div>
          <strong>{o.orderNumber}</strong>
          <CopyValue value={o.orderNumber} label="Salin nomor pesanan" />
          <time>{when(o.createdAt)}</time>
        </div>
      </header>
      <div className="simple-detail-columns">
        <div className="simple-detail-main">
          <section className="simple-state" data-tone={f.tone}>
            <Icon size={24} />
            <div>
              <h2>{f.label}</h2>
              <p>{f.description}</p>
              {f.key === "payment" &&
                p?.status === "PENDING_PAYMENT" &&
                o.expiresAt && (
                  <small>Batas pembayaran: {when(o.expiresAt)}</small>
                )}
              {c?.rejectionReason && p?.status === "REJECTED" && (
                <p>{c.rejectionReason}</p>
              )}
              {f.financial && <strong>{f.financial}</strong>}
              {f.operation && <p role="status">{f.operation}</p>}
            </div>
          </section>
          {f.action === "verify" && p && has(PERMISSIONS.PAYMENT_READ) && (
            <section className="order-panel simple-proof" id="order-payment">
              <h2>Bukti dari pembeli</h2>
              {c && (
                <div className="simple-proof-row">
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/v1/admin/payments/proof?id=${c.id}`}
                  >
                    {c.proofMime.startsWith("image/") ? (
                      <img
                        alt="Perbesar bukti transfer"
                        src={`/api/v1/admin/payments/proof?id=${c.id}`}
                      />
                    ) : (
                      "Buka bukti PDF"
                    )}
                  </a>
                  <dl className="flow-totals">
                    <div>
                      <dt>Total tagihan</dt>
                      <dd>{formatIDR(o.total)}</dd>
                    </div>
                    <div>
                      <dt>Klaim transfer</dt>
                      <dd>{formatIDR(c.amount)}</dd>
                    </div>
                  </dl>
                </div>
              )}
              <p className="simple-note">
                <Info size={16} /> Periksa mutasi sebelum menyetujui. Bukti
                unggah bukan konfirmasi bank.
              </p>
              {has(PERMISSIONS.PAYMENT_VERIFY) && (
                <PaymentVerify paymentId={p.id} amount={o.total} />
              )}
            </section>
          )}
          {["ready", "packing"].includes(f.key) &&
            ["prepare", "create"].includes(f.action) &&
            !hold &&
            o.paymentStatus === "PAID" && (
              <section className="order-panel simple-next">
                <Package size={28} />
                <div>
                  <h2>
                    {f.key === "ready"
                      ? "Paket belum disiapkan"
                      : "Periksa barang sebelum membuat resi"}
                  </h2>
                  <p>
                    {f.key === "ready"
                      ? "Lanjut siapkan paket untuk dikirim."
                      : "Penerima, alamat, layanan dan berat akan ditinjau sekali."}
                  </p>
                  <OrderMainAction
                    orderId={id}
                    action={f.action}
                    label={f.cta}
                    permissions={a.permissions}
                    official={official}
                  />
                </div>
              </section>
            )}
          {hold && f.key !== "return" && (
            <section className="order-panel">
              <h2>Kasus perlu ditangani</h2>
              <p>Pemenuhan ditahan. Tracking tetap diperbarui.</p>
              <Link
                className="flow-primary"
                href={
                  legacy
                    ? `/admin/orders/${id}/legacy-refund`
                    : `/admin/orders/${id}/resolution?case=${f.activeCaseId}`
                }
              >
                Lanjutkan penanganan kasus
              </Link>
            </section>
          )}
          {["pickup", "shipped", "return", "done"].includes(f.key) && (
            <section
              id="order-shipping"
              className="order-panel simple-shipping"
            >
              <h2>
                <Truck size={20} /> Pengiriman
              </h2>
              {official ? (
                <JntOrderPanel
                  orderId={id}
                  isOfficial
                  service={o.shippingService}
                  status={o.status}
                  hasPaid={o.paymentStatus === "PAID" && p?.status === "PAID"}
                  canCreate={false}
                  canUpdate={has(PERMISSIONS.SHIPPING_UPDATE)}
                  fulfillmentHeld={hold}
                  canRead={has(PERMISSIONS.SHIPPING_READ)}
                  requestState={r?.state || null}
                  errorCode={r?.errorCode}
                  externalOrderId={r?.externalOrderId}
                  awb={r?.awb || null}
                  shipmentStatus={s?.status || null}
                  carrierCondition={s?.carrierCondition}
                  sellerHandoverAt={!!s?.sellerHandoverAt}
                  compact
                />
              ) : (
                <p>
                  {o.shippingCourier} · {s?.trackingNumber}
                </p>
              )}
              {s && <small>Terakhir diperiksa: {when(s.updatedAt)}</small>}
              <details open={["shipped", "return", "done"].includes(f.key)}>
                <summary>
                  {f.key === "return"
                    ? "Lacak retur"
                    : f.key === "done"
                      ? "Lihat riwayat pengiriman"
                      : "Riwayat tracking"}
                </summary>
                <ol className="flow-history">
                  {s?.events.map((e) => (
                    <li key={e.id}>
                      <p>{e.description}</p>
                      <time>{when(e.occurredAt)}</time>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
          <section className="order-panel simple-products">
            <h2 className="sr-only">Produk pesanan</h2>
            <ul>
              {o.items.map((i) => (
                <li key={i.id}>
                  <div className="order-thumb">
                    {i.imageUrl ? (
                      <img src={i.imageUrl} alt={i.productName} />
                    ) : null}
                  </div>
                  <div>
                    <strong>{i.productName}</strong>
                    <p>{i.variantLabel.replace(/\s*\/\s*/g, " • ")}</p>
                    <small>
                      {i.quantity} × {formatIDR(i.unitPrice)}
                    </small>
                  </div>
                  <strong>{formatIDR(i.lineTotal)}</strong>
                </li>
              ))}
            </ul>
            <dl className="flow-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatIDR(o.subtotal)}</dd>
              </div>
              {o.discount > 0 && (
                <div>
                  <dt>Diskon</dt>
                  <dd>−{formatIDR(o.discount)}</dd>
                </div>
              )}
              <div>
                <dt>Ongkir</dt>
                <dd>{formatIDR(o.shippingCost)}</dd>
              </div>
              <div className="simple-total">
                <dt>Total</dt>
                <dd>{formatIDR(o.total)}</dd>
              </div>
            </dl>
          </section>
          {f.key === "payment" && whatsapp && (
            <a
              target="_blank"
              rel="noreferrer"
              className="flow-secondary"
              href={"https://wa.me/" + whatsapp}
            >
              Hubungi pembeli
            </a>
          )}
        </div>
        <aside>
          <details className="order-panel">
            <summary>
              <UserRound size={19} /> Penerima: {o.address?.recipientName}
            </summary>
            {o.address && (
              <address className="not-italic">
                <p>{o.address.phone}</p>
                <p>
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
          </details>
          <details className="order-panel">
            <summary>
              <CreditCard size={19} /> Pembayaran:{" "}
              {paymentDisplayStatus(o.paymentStatus)}
            </summary>
            <p>
              {p?.provider === "manual" ? "Transfer bank manual" : p?.provider}
            </p>
            {p && has(PERMISSIONS.PAYMENT_READ) && (
              <Link href={`/admin/orders/${id}/payment`}>
                Lihat bukti dan riwayat pembayaran
              </Link>
            )}
          </details>
          {!["pickup", "shipped", "return", "done"].includes(f.key) && (
            <details
              id="order-shipping"
              className="order-panel"
              open={!!f.operation}
            >
              <summary>
                <Truck size={19} /> Pengiriman: {o.shippingCourier} ·{" "}
                {o.shippingService}
              </summary>
              <p>Berat {o.shippingWeightGram || 0} gram</p>
              {official ? (
                <JntOrderPanel
                  orderId={id}
                  isOfficial
                  service={o.shippingService}
                  status={o.status}
                  hasPaid={o.paymentStatus === "PAID" && p?.status === "PAID"}
                  canCreate={false}
                  canUpdate={has(PERMISSIONS.SHIPPING_UPDATE)}
                  fulfillmentHeld={hold || o.paymentStatus === "REFUNDED"}
                  canRead={has(PERMISSIONS.SHIPPING_READ)}
                  requestState={r?.state || null}
                  errorCode={r?.errorCode}
                  externalOrderId={r?.externalOrderId}
                  awb={r?.awb || null}
                  shipmentStatus={s?.status || null}
                  carrierCondition={s?.carrierCondition}
                  compact
                />
              ) : (
                has(PERMISSIONS.SHIPPING_UPDATE) && (
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
                )
              )}
            </details>
          )}
          <details className="order-panel">
            <summary>
              <RotateCcw size={19} /> Pembatalan, retur &amp; refund
            </summary>
            {view.cases.map((c) => (
              <Link
                className="flow-secondary"
                key={c.id}
                href={`/admin/orders/${id}/resolution?case=${c.id}`}
              >
                {c.kind === "CANCEL" ? "Pembatalan" : "Retur / refund"} ·{" "}
                {formatIDR(c.refundAmount)} →
              </Link>
            ))}
            {!hold &&
              !["CANCELLED", "EXPIRED", "REFUNDED"].includes(o.status) &&
              (!view.leftWarehouse && has(PERMISSIONS.ORDER_CANCEL) ? (
                <Link
                  className="flow-secondary"
                  href={`/admin/orders/${id}/resolution?mode=CANCEL`}
                >
                  Batalkan pesanan
                </Link>
              ) : view.paid && has(PERMISSIONS.PAYMENT_VERIFY) ? (
                <Link
                  className="flow-secondary"
                  href={`/admin/orders/${id}/resolution`}
                >
                  Buat kasus retur / refund
                </Link>
              ) : null)}
            <p>
              Pembatalan resi tidak otomatis membatalkan transaksi atau
              mengembalikan uang.
            </p>
          </details>
          <details className="order-panel">
            <summary>
              <Clock size={19} /> Status Pesanan
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
          {!!o.jntShipmentAttempts.length && (
            <details className="order-panel">
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

        </aside>
      </div>
    </div>
  );
}
