import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import type { AuthUser } from "@/lib/auth/session";
import { FilterForm } from "@/components/ui/filter-form";
import Link from "@/components/ui/navigation";
import Image from "next/image";
import { Package, Plus } from "lucide-react";
import { ProductStatus } from "@prisma/client";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listManagedProducts } from "@/modules/catalog/product-management.service";
import { formatIDR, effectivePrice } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
export const dynamic = "force-dynamic";
const labels = { DRAFT: "Draft", PUBLISHED: "Terbit", ARCHIVED: "Arsip" };
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requireBackofficeUser(PERMISSIONS.PRODUCT_READ);
  return <Suspense fallback={<OperationsSkeleton />}><ProductsContent user={user} searchParams={searchParams} /></Suspense>;
}
async function ProductsContent({ user, searchParams }: { user: AuthUser; searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const status = Object.values(ProductStatus).includes(params.status as ProductStatus) ? params.status as ProductStatus : undefined;
  const result = await listManagedProducts(user, params.q, status, Number(params.page || 1));
  const canCreate = user.permissions.includes(PERMISSIONS.PRODUCT_CREATE);
  const href = (page: number) => `/admin/products?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status ? { status } : {}), page: String(page) })}`;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-ink">Produk</h1><p className="mt-1 text-sm text-ink-soft">{result.total} produk · kelola katalog toko ini.</p></div>{canCreate && <Button asChild><Link href="/admin/products/new"><Plus size={16} /> Tambah produk</Link></Button>}</header>
    <FilterForm action={"/admin/products"} key={JSON.stringify(params)} className="flex flex-wrap gap-3" role="search"><label className="w-full min-w-0 sm:w-auto sm:flex-1"><span className="sr-only">Cari produk</span><Input name="q" defaultValue={params.q} placeholder="Cari nama atau slug produk" /></label><label><span className="sr-only">Filter status</span><select name="status" defaultValue={status || ""} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Semua status</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><Button type="submit" variant="outline">Cari</Button><Button asChild variant="ghost"><Link href="/admin/categories">Kategori</Link></Button></FilterForm>
    {!result.items.length ? <EmptyState icon={<Package size={32} />} title={params.q || status ? "Tidak ada produk yang sesuai" : "Katalog masih kosong"} description={params.q || status ? "Ubah kata kunci atau filter status." : "Mulai dengan draft pertama, tambahkan varian dan foto, lalu terbitkan."} action={canCreate ? <Button asChild><Link href="/admin/products/new">Tambah produk pertama</Link></Button> : undefined} /> : <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">{result.items.map(p => <li key={p.id} className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[64px_minmax(0,2fr)_minmax(120px,1fr)] sm:items-center" data-testid={`admin-product-${p.slug}`}>
      <div className="relative h-14 w-14 rounded-xl bg-surface sm:h-16 sm:w-16">{p.images[0] ? <Image src={p.images[0].url} alt={p.images[0].alt || p.name} fill sizes="64px" unoptimized={p.images[0].url.startsWith("/api/v1/product-images/")} className="rounded-xl object-cover" /> : <Package size={22} className="m-auto mt-4 text-ink-soft" />}</div>
      <div className="min-w-0"><Link href={`/admin/products/${p.id}`} prefetch={false} className="break-words font-semibold underline-offset-4 hover:underline">{p.name}</Link><p className="mt-1 text-xs text-ink-soft">{p.category?.name || "Tanpa kategori"} · {p._count.variants} varian</p><span className="mt-2 inline-block rounded-full border border-line px-2.5 py-1 text-xs font-medium">{labels[p.status]}</span></div>
      <div className="col-start-2 text-sm font-semibold tabular-nums sm:col-auto sm:text-right">{formatIDR(effectivePrice(p.basePrice, p.salePrice))}<div className="mt-2"><Link href={`/admin/products/${p.id}`} prefetch={false} className="inline-flex min-h-11 items-center text-xs font-normal underline underline-offset-4">Buka produk</Link></div></div>
    </li>)}</ul>}
    {result.pages > 1 && <nav aria-label="Halaman produk" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Halaman {result.page} dari {result.pages}</span><div className="flex gap-3">{result.page > 1 && <Button asChild variant="outline" size="sm" className="min-h-11"><Link href={href(result.page - 1)} prefetch={false}>Sebelumnya</Link></Button>}{result.page < result.pages && <Button asChild variant="outline" size="sm" className="min-h-11"><Link href={href(result.page + 1)} prefetch={false}>Berikutnya</Link></Button>}</div></nav>}
  </div>;
}
