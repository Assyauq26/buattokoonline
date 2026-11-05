import { FilterForm } from "@/components/ui/filter-form";
import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import Link from "@/components/ui/navigation";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { pageNumber } from "@/modules/inventory/inventory.validation";
import { formatIDR } from "@/lib/money";
import { ORDER_STATUS_LABEL, orderDisplayStatus, paymentDisplayStatus } from "@/lib/order-status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLinks } from "@/components/admin/operations-layout";
import { readPage } from "@/lib/pagination";
export const dynamic = "force-dynamic";
export default async function AdminOrdersPage(props: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireBackofficeUser(PERMISSIONS.ORDER_READ);
  return <Suspense fallback={<OperationsSkeleton />}><AdminOrdersPageContent {...props} /></Suspense>;
}
async function AdminOrdersPageContent({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").slice(0, 200); const status = Object.values(OrderStatus).includes(params.status as OrderStatus) ? params.status as OrderStatus : undefined;
  const where: Prisma.OrderWhereInput = { ...(q ? { orderNumber: { contains: q, mode: "insensitive" } } : {}), ...(status ? { status } : {}) };
  const { rows, total, pages, page } = await readPage(pageNumber(params.page),
    () => prisma.order.count({ where }),
    (skip, take) => prisma.order.findMany({ where, select: { id: true, orderNumber: true, createdAt: true, status: true, paymentStatus: true, total: true, user: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, skip }));
  return <div className="space-y-6"><header><h1 className="text-2xl font-bold">Pesanan</h1><p className="mt-1 text-sm text-ink-soft">{total} pesanan · pantau pembayaran dan pemenuhan pesanan.</p></header>
    <FilterForm action={"/admin/orders"} key={JSON.stringify(params)} role="search" className="flex flex-wrap gap-3"><label className="w-full min-w-0 sm:w-auto sm:flex-1"><span className="sr-only">Cari nomor pesanan</span><Input className="placeholder:text-ink-soft" name="q" defaultValue={q} placeholder="Cari nomor pesanan" maxLength={200} /></label><label><span className="sr-only">Status pesanan</span><select name="status" defaultValue={status || ""} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Semua status</option>{Object.values(OrderStatus).map(s => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</select></label><Button variant="outline">Cari</Button><Link href="/admin/orders" className="self-center text-sm underline">Reset</Link></FilterForm>
    {!rows.length ? <EmptyState title="Tidak ada pesanan yang sesuai" description="Ubah pencarian atau filter. Pesanan baru akan tampil di sini setelah checkout." /> : <table className="block w-full rounded-2xl border border-line bg-white text-sm xl:table"><caption className="sr-only">Daftar pesanan</caption><thead className="hidden text-left text-xs text-ink-soft xl:table-header-group"><tr>{["Pesanan / pelanggan", "Tanggal", "Status", "Pembayaran", "Total"].map(t => <th key={t} scope="col" className="p-4 font-medium">{t}</th>)}</tr></thead><tbody className="block divide-y divide-line xl:table-row-group">{rows.map(o => <tr key={o.id} data-testid={`admin-order-${o.orderNumber}`} className="grid min-w-0 grid-cols-2 gap-3 p-4 xl:table-row xl:p-0"><td className="col-span-2 min-w-0 xl:p-4"><Link className="break-all font-semibold underline underline-offset-4" href={`/admin/orders/${o.id}`}>{o.orderNumber}</Link><p className="mt-1 break-words text-xs text-ink-soft">{o.user.name} · {o._count.items} item</p></td><td className="text-xs text-ink-soft xl:p-4"><span className="mb-1 block xl:hidden">Tanggal</span>{o.createdAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</td><td className="xl:p-4"><span className="mb-1 block text-xs text-ink-soft xl:hidden">Status</span>{orderDisplayStatus(o.status, o.paymentStatus)}</td><td className="break-words text-xs xl:p-4"><span className="mb-1 block text-ink-soft xl:hidden">Pembayaran</span>{paymentDisplayStatus(o.paymentStatus)}</td><td className="font-semibold tabular-nums xl:p-4"><span className="mb-1 block text-xs font-normal text-ink-soft xl:hidden">Total</span>{formatIDR(o.total)}</td></tr>)}</tbody></table>}
    <PageLinks path="/admin/orders" params={{ q, status }} page={page} pages={pages} />
  </div>;
}
