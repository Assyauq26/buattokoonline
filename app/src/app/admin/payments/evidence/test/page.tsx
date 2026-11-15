import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { storeScope } from "@/modules/payments/evidence/repository";
import { listBluTestOrders } from "@/modules/payments/evidence/test-orders";
import { BluTransferTest } from "@/components/admin/blu-transfer-test";

export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireEvidenceAdmin(true);
  const [sources, tests] = await Promise.all([
    prisma.paymentEvidenceSource.findMany({ where: { storeScope: storeScope(), kind: "GMAIL_BANK",
      encryptedSecret: { not: null }, health: "REVIEW_ONLY", bankAccount: { isActive: true, deletedAt: null } },
      select: { id: true, label: true, bankAccount: { select: { accountNumber: true } } }, take: 30 }),
    listBluTestOrders(user.id),
  ]);
  return <div className="mx-auto max-w-3xl space-y-6">
    <Link href="/admin/settings/payment-methods/gmail-bank" className="inline-flex min-h-11 items-center gap-2 text-sm"><ArrowLeft size={16} /> Koneksi blu</Link>
    <header><p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Uji terbatas · khusus admin</p>
      <h1 className="text-2xl font-bold tracking-tight">Uji transfer blu</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">Terbitkan nominal unik, transfer dari aplikasi bank Anda, lalu cocokkan notifikasi yang masuk.</p></header>
    <BluTransferTest initialTests={tests} serverNow={new Date().toISOString()}
      sources={sources.map(s => ({ id: s.id, label: `${s.label} · ••••${s.bankAccount?.accountNumber.slice(-4)}` }))} />
  </div>;
}
