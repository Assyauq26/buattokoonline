import { FilterForm } from "@/components/ui/filter-form";
import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import Link from "@/components/ui/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { pageNumber } from "@/modules/inventory/inventory.validation";
import { available } from "@/modules/inventory/inventory.service";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLinks } from "@/components/admin/operations-layout";
import { readPage } from "@/lib/pagination";
export const dynamic = "force-dynamic";
export default async function InventoryPage(props: { searchParams: Promise<{ q?: string; stock?: string; page?: string }> }) {
  await requireBackofficeUser(PERMISSIONS.INVENTORY_READ);
  return <Suspense fallback={<OperationsSkeleton />}><InventoryPageContent {...props} /></Suspense>;
}
async function InventoryPageContent({ searchParams }: { searchParams: Promise<{ q?: string; stock?: string; page?: string }> }) {
    const params = await searchParams; const q = (params.q || "").slice(0, 200);
  const where: Prisma.ProductVariantWhereInput = { ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}), ...(params.stock === "reserved" ? { inventory: { reserved: { gt: 0 } } } : params.stock === "empty" ? { OR: [{ inventory: null }, { inventory: { onHand: 0 } }], ...(q ? { AND: [{ OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] }] } : {}) } : {}) };
  const { rows, total, pages, page } = await readPage(pageNumber(params.page),
    () => prisma.productVariant.count({ where }),
    (skip, take) => prisma.productVariant.findMany({ where, select: { id: true, sku: true, color: true, size: true, product: { select: { name: true, status: true } }, inventory: { select: { onHand: true, reserved: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }));
  return <div className="space-y-6"><header><h1 className="text-2xl font-bold">Inventori</h1><p className="mt-1 text-sm text-ink-soft">{total} varian · stok fisik, reservasi, dan stok tersedia.</p></header>
    <FilterForm action={"/admin/inventory"} key={JSON.stringify(params)} role="search" className="flex flex-wrap gap-3"><label className="w-full min-w-0 sm:min-w-[180px] sm:w-auto sm:flex-1"><span className="sr-only">Cari produk atau SKU</span><Input className="placeholder:text-ink-soft" name="q" defaultValue={q} placeholder="Cari produk atau SKU" maxLength={200} /></label><label><span className="sr-only">Filter stok</span><select name="stock" defaultValue={params.stock || ""} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Semua stok</option><option value="reserved">Memiliki reservasi</option><option value="empty">Stok fisik kosong</option></select></label><Button variant="outline">Cari</Button><Link href="/admin/inventory" className="self-center text-sm underline">Reset</Link></FilterForm>
    {!rows.length ? <EmptyState title="Tidak ada varian yang sesuai" description="Ubah pencarian atau filter. Varian baru dibuat melalui pengelolaan produk." /> : <table className="block w-full rounded-2xl border border-line bg-white text-sm xl:table"><caption className="sr-only">Stok varian produk</caption><thead className="hidden text-left text-xs text-ink-soft xl:table-header-group"><tr>{["Produk / SKU", "Fisik", "Reservasi", "Tersedia", ""].map((v, i) => <th key={i} scope="col" className="p-4 font-medium">{v}</th>)}</tr></thead><tbody className="block divide-y divide-line xl:table-row-group">{rows.map(v => <tr key={v.id} className="grid min-w-0 grid-cols-3 gap-3 p-4 xl:table-row xl:p-0"><td className="col-span-3 min-w-0 xl:p-4"><p className="break-words font-semibold">{v.product.name}</p><p className="mt-1 break-all text-xs text-ink-soft">{v.sku} · {[v.color, v.size].filter(Boolean).join(" / ") || "Standar"} · {v.product.status}</p></td>{[["Fisik", v.inventory?.onHand || 0], ["Reservasi", v.inventory?.reserved || 0], ["Tersedia", available(v.inventory?.onHand || 0, v.inventory?.reserved || 0)]].map(([label, value]) => <td key={label} className="tabular-nums xl:p-4"><span className="mb-1 block text-xs text-ink-soft xl:hidden">{label}</span>{value}</td>)}<td className="col-span-3 xl:p-4"><Link href={`/admin/inventory/${v.id}`} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Kelola stok<span className="sr-only"> {v.sku}</span></Link></td></tr>)}</tbody></table>}
    <PageLinks path="/admin/inventory" params={{ q, stock: params.stock }} page={page} pages={pages} />
  </div>;
}
