import { FilterForm } from "@/components/ui/filter-form";
import { movementLabel } from "@/components/admin/movement-label";
import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import type { AuthUser } from "@/lib/auth/session";
import Link from "@/components/ui/navigation";
import { notFound } from "next/navigation";
import { MovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { pageNumber } from "@/modules/inventory/inventory.validation";
import { available } from "@/modules/inventory/inventory.service";
import { OperationForm } from "@/components/admin/operation-form";
import { OperationSection, PageLinks } from "@/components/admin/operations-layout";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function InventoryDetail(props: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; type?: string }> }) {
  const actor = await requireBackofficeUser(PERMISSIONS.INVENTORY_READ);
  return <Suspense fallback={<OperationsSkeleton />}><InventoryDetailContent {...props} actor={actor} /></Suspense>;
}
async function InventoryDetailContent({ params, searchParams, actor }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; type?: string }> } & { actor: AuthUser }) {
  const { id } = await params;
  const variant = await prisma.productVariant.findUnique({ where: { id }, include: { product: { select: { name: true } }, inventory: true } }); if (!variant) notFound();
  const query = await searchParams; const type = Object.values(MovementType).includes(query.type as MovementType) ? query.type as MovementType : undefined;
  const where = { variantId: id, ...(type ? { type } : {}) }; const total = await prisma.inventoryMovement.count({ where }); const pages = Math.max(1, Math.ceil(total / 20)); const page = Math.min(pageNumber(query.page), pages);
  const movements = await prisma.inventoryMovement.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }); const stock = variant.inventory;
  return <div className="max-w-5xl space-y-7"><Link href="/admin/inventory" className="text-sm underline">Kembali ke inventori</Link><header><h1 className="break-words text-2xl font-bold">{variant.product.name}</h1><p className="mt-1 break-all text-sm text-ink-soft">{variant.sku} · {[variant.color, variant.size].filter(Boolean).join(" / ") || "Standar"}</p></header>
    <dl className="grid grid-cols-3 gap-4 border-y border-line py-5 text-sm">{[["Fisik", stock?.onHand || 0], ["Reservasi", stock?.reserved || 0], ["Tersedia", available(stock?.onHand || 0, stock?.reserved || 0)]].map(([label, value]) => <div key={label}><dt className="text-ink-soft">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
    {actor.permissions.includes(PERMISSIONS.INVENTORY_ADJUST) ? <OperationSection title="Adjustment stok"><p className="text-sm text-ink-soft">Masukkan jumlah fisik hasil perhitungan. Reservasi tidak diubah. Jika stok berubah selama pengisian, server akan menolak adjustment.</p><OperationForm url={`/api/v1/admin/inventory/${id}`} label="Simpan adjustment" confirmation="Ubah stok fisik sesuai hasil perhitungan? Perubahan dicatat bersama alasan dan identitas staf." fields={[{ name: "expectedOnHand", label: "Stok awal", type: "hidden", value: stock?.onHand || 0 }, { name: "newOnHand", label: "Stok fisik baru", type: "number", value: stock?.onHand || 0, min: stock?.reserved || 0, max: 2147483647, required: true }, { name: "reason", label: "Alasan adjustment", type: "textarea", required: true, maxLength: 2000 }]} /></OperationSection> : <p className="text-sm text-ink-soft">Akses baca saja. Adjustment memerlukan izin inventory.adjust.</p>}
    <OperationSection title="Histori pergerakan"><FilterForm action={`/admin/inventory/${id}`} key={JSON.stringify(query)} className="flex flex-wrap gap-3"><label><span className="sr-only">Jenis pergerakan</span><select name="type" defaultValue={type || ""} className="h-11 rounded-xl border border-line px-3 text-sm"><option value="">Semua pergerakan</option>{Object.values(MovementType).map(t => <option key={t}>{t}</option>)}</select></label><Button variant="outline">Filter</Button></FilterForm>{movements.length ? <ol className="divide-y divide-line">{movements.map(m => <li key={m.id} className="grid min-w-0 gap-2 py-4 sm:grid-cols-[150px_110px_minmax(0,1fr)_minmax(0,2fr)]"><time className="text-xs text-ink-soft">{m.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</time><span className="text-xs font-semibold">{m.type}</span><span className="text-sm tabular-nums">{movementLabel(m.type, m.quantity)}</span><div className="min-w-0 break-words text-sm"><p>{m.note || "Tanpa catatan"}</p>{m.reference && <p className="mt-1 break-all text-xs text-ink-soft">Referensi: {m.reference}</p>}</div></li>)}</ol> : <p className="py-6 text-sm text-ink-soft">Belum ada pergerakan yang sesuai.</p>}<PageLinks path={`/admin/inventory/${id}`} params={{ type }} page={page} pages={pages} /></OperationSection>
  </div>;
}
