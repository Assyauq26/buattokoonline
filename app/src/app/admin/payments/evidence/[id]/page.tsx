import { evidenceReasonLabel } from "@/modules/payments/evidence/presentation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { previewEnabled } from "@/modules/payments/evidence/policy";
import { storeScope } from "@/modules/payments/evidence/repository";
import { PaymentEvidenceReview } from "@/components/admin/payment-evidence-review";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireBackofficeUser(PERMISSIONS.PAYMENT_READ);
  if (!previewEnabled()) notFound();
  const { id } = await params,
    now = new Date();
  const e = await prisma.incomingPaymentEvidence.findFirst({
    where: { id, source: { storeScope: storeScope() } },
    include: {
      source: { select: { id: true, label: true } },
      claim: {
        select: {
          createdAt: true,
          reason: true,
          attempt: {
            select: {
              payment: { select: { order: { select: { orderNumber: true } } } },
            },
          },
        },
      },
    },
  });
  if (!e) notFound();
  const canClaim =
    !e.claim &&
    e.reason === "SELLER_REVIEW_REQUIRED" &&
    e.trusted &&
    !!e.occurredAt;
  const candidates = canClaim
    ? await prisma.paymentEvidenceAttempt.findMany({
        where: {
          sourceId: e.sourceId,
          payable: e.amount!,
          createdAt: { lte: e.occurredAt! },
          expiresAt: { gte: e.occurredAt!, gt: now },
          claim: null,
          payment: {
            status: {
              in: ["PENDING_PAYMENT", "WAITING_VERIFICATION", "REJECTED"],
            },
            order: {
              status: "PENDING_PAYMENT",
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
        select: {
          id: true,
          payable: true,
          payment: { select: { order: { select: { orderNumber: true } } } },
        },
        take: 50,
      })
    : [];
  return (
    <div className="settings-form !max-w-3xl">
      <Link
        className="inline-flex min-h-11 items-center text-sm"
        href="/admin/payments/evidence"
      >
        ← Kembali ke pemeriksaan
      </Link>
      <header>
        <h1>Pemeriksaan bukti pembayaran</h1>
        <p>{e.source.label}</p>
      </header>
      <section className="settings-card space-y-3">
        <h2 className="!mb-0">
          {e.claim
            ? "Sudah dikaitkan · belum menyatakan lunas"
            : "Perlu pemeriksaan"}
        </h2>
        <p className="text-2xl font-semibold tabular-nums">
          {e.amount === null
            ? "Nominal belum valid"
            : `${e.currency} ${e.amount.toLocaleString("id-ID")}`}
        </p>
        <p className="break-all text-sm text-zinc-600">
          {evidenceReasonLabel(e.reason)}
        </p>
        <p className="text-sm text-zinc-600">
          Status sumber: {e.providerStatus}. Nominal dan waktu bukan bukti
          identitas pembayar.
        </p>
        {e.claim && (
          <p className="text-sm">
            {e.claim.attempt.payment.order.orderNumber} · {e.claim.reason}
          </p>
        )}
      </section>
      {canClaim && user.permissions.includes(PERMISSIONS.PAYMENT_VERIFY) ? (
        <PaymentEvidenceReview
          evidenceId={e.id}
          candidates={candidates.map((c) => ({
            id: c.id,
            payable: c.payable,
            orderNumber: c.payment.order.orderNumber,
          }))}
        />
      ) : (
        !e.claim && (
          <p className="rounded-xl bg-zinc-100 p-4 text-sm">
            Bukti belum memenuhi syarat untuk dikaitkan. Periksa identitas
            sumber, status, rekening, dan nominal secara terpisah. Jangan paksa
            persetujuan atau mengubah histori transaksi.
          </p>
        )
      )}
    </div>
  );
}
