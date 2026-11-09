"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductAction } from "@/modules/catalog/product-management.actions";

export function DeleteProductButton({ id, name, revision, disabled = false, className = "min-h-11 rounded-xl border px-4 text-sm" }: { id: string; name: string; revision: string; disabled?: boolean; className?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <div><button type="button" className={className} disabled={disabled || pending} onClick={() => {
    if (!window.confirm(`Hapus produk “${name}”? Produk dengan riwayat transaksi, stok, atau promosi akan diarsipkan. Penghapusan permanen tidak dapat dibatalkan.`)) return;
    start(async () => {
      const result = await deleteProductAction(id, revision);
      setMessage(result.ok && result.data ? result.data.message : result.error || "Penghapusan gagal.");
      if (result.ok && result.data) {
        window.alert(result.data.message);
        if (result.data.outcome === "deleted") router.push("/admin/products");
        router.refresh();
      }
    });
  }}>{pending ? "Menghapus…" : "Hapus produk"}</button>{message && <p role="status" className="mt-2 text-xs">{message}</p>}</div>;
}
