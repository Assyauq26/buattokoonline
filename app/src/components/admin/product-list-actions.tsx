"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/navigation";
import { MoreHorizontal } from "lucide-react";
import { ActionPopover } from "@/components/ui/action-popover";
import { deleteProductAction, setProductStatusAction } from "@/modules/catalog/product-management.actions";
import type { ProductStatus } from "@prisma/client";


export function ProductListActions({ id, slug, name, status, updatedAt, canUpdate, canDelete }: {
  id: string; slug: string; name: string; status: ProductStatus; updatedAt: string; canUpdate: boolean; canDelete: boolean;
}) {
  const [pending, start] = useTransition(), [error, setError] = useState("");
  const router = useRouter();
  function change(next: ProductStatus) {
    if (!window.confirm(`${next === "ARCHIVED" ? "Arsipkan" : next === "PUBLISHED" ? "Terbitkan" : "Jadikan draft"} produk “${name}”?`)) return;
    start(async () => { const result = await setProductStatusAction(id, updatedAt, next); setError(result.error || ""); if (result.ok) router.refresh(); });
  }
  function remove() {
    if (!window.confirm(`Hapus produk “${name}”? Produk dengan riwayat transaksi, stok, atau promosi akan diarsipkan. Penghapusan permanen tidak dapat dibatalkan.`)) return;
    start(async () => {
      const result = await deleteProductAction(id, updatedAt);
      setError(result.ok ? "" : result.error || "Penghapusan gagal.");
      if (result.ok && result.data) { window.alert(result.data.message); router.refresh(); }
    });
  }
  const item = "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-zinc-100";
  return <div className="min-w-0">
    <ActionPopover label={`Aksi ${name}`} panelClassName="top-full mt-1" trigger={<MoreHorizontal size={22} aria-hidden="true" />}>
      <Link href={`/admin/products/${id}`} className={item}>{canUpdate ? "Edit produk" : "Detail produk"}</Link>
      {status === "PUBLISHED" && <Link href={`/product/${slug}`} className={item}>Lihat di toko</Link>}
      {canUpdate && <button className={item} disabled={pending} onClick={() => change(status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}>{status === "PUBLISHED" ? "Jadikan draft" : "Terbitkan"}</button>}
      {canDelete && status !== "ARCHIVED" && <button className={item} disabled={pending} onClick={() => change("ARCHIVED")}>Arsipkan</button>}
      {canDelete && <button type="button" disabled={pending} className={item} onClick={remove}>Hapus produk</button>}
    </ActionPopover>
    {error && <p role="alert" className="mt-1 max-w-48 text-xs text-red-700">{error}</p>}
  </div>;
}
