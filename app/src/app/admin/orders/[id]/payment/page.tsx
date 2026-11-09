import { orderWorkflowStyle } from "@/modules/orders/order-workflow-theme";
import "../../orders.css";
import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import type { AuthUser } from "@/lib/auth/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getOrderById } from "@/modules/orders/orders.service";
import { PaymentVerify } from "@/components/admin/payment-verify";
import { formatIDR } from "@/lib/money";
import { paymentDisplayStatus } from "@/lib/order-status";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireBackofficeUser(PERMISSIONS.PAYMENT_READ);
  return (
    <Suspense fallback={<OperationsSkeleton />}>
      <PaymentContent params={params} actor={actor} />
    </Suspense>
  );
}
async function PaymentContent({
  params,
  actor: a,
}: {
  params: Promise<{ id: string }>;
  actor: AuthUser;
}) {
  const { id } = await params,
    o = await getOrderById(id);
  if (!o?.payment) notFound();
  const p = o.payment,
    c = p.confirmations[0];
  return (
    <div
      className="order-workflow resolution-flow"
      style={await orderWorkflowStyle()}
    >
      <Link className="flow-back" href={`/admin/orders/${id}`}>
        <ArrowLeft size={20} /> Detail pesanan
      </Link>
      <header>
        <h1>Verifikasi pembayaran</h1>
        <strong>{o.orderNumber}</strong>
        <span className="flow-status">{paymentDisplayStatus(p.status)}</span>
      </header>
      {c ? (
        <div className="flow-columns">
          <section className="order-panel">
            <h2>Bukti transfer dari pembeli</h2>
            <a
              target="_blank"
              rel="noreferrer"
              className="flow-proof-preview"
              href={`/api/v1/admin/payments/proof?id=${c.id}`}
            >
              {c.proofMime.startsWith("image/") ? (
                <img
                  src={`/api/v1/admin/payments/proof?id=${c.id}`}
                  alt="Bukti transfer pembeli"
                />
              ) : (
                <span>Buka dokumen bukti transfer ↗</span>
              )}
            </a>
            <p>
              {c.senderBank} · {c.senderName}
            </p>
            <p>
              {c.transferDate.toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              })}{" "}
              WIB
            </p>
          </section>
          <aside>
            <section className="order-panel">
              <dl className="flow-totals">
                <div>
                  <dt>Total tagihan</dt>
                  <dd>{formatIDR(o.total)}</dd>
                </div>
                <div>
                  <dt>Jumlah ditransfer (klaim pembeli)</dt>
                  <dd>{formatIDR(c.amount)}</dd>
                </div>
              </dl>
              <p className="flow-warning">
                Periksa mutasi rekening sebelum menyetujui. Bukti unggah bukan
                konfirmasi bank.
              </p>
              {c.rejectionReason && (
                <p className="flow-info">
                  Perbaikan yang diminta: {c.rejectionReason}
                </p>
              )}
              {p.status === "WAITING_VERIFICATION" &&
                o.status === "PENDING_PAYMENT" &&
                a.permissions.includes(PERMISSIONS.PAYMENT_VERIFY) && (
                  <Suspense fallback={<OperationsSkeleton />}>
                    <PaymentVerify paymentId={p.id} />
                  </Suspense>
                )}
            </section>
          </aside>
        </div>
      ) : (
        <section className="order-panel">
          Bukti transfer belum tersedia.
        </section>
      )}
    </div>
  );
}
