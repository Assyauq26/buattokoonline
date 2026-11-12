"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "@/components/ui/navigation";
import {
  MoreHorizontal,
  Pencil,
  Store,
  Upload,
  Archive,
  Trash2,
  X,
  Package,
} from "lucide-react";
import {
  deleteProductAction,
  setProductStatusAction,
} from "@/modules/catalog/product-management.actions";
import type { ProductStatus } from "@prisma/client";

export function ProductListActions({
  id,
  slug,
  name,
  status,
  updatedAt,
  canUpdate,
  canDelete,
  image,
}: {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  updatedAt: string;
  canUpdate: boolean;
  canDelete: boolean;
  image?: string;
}) {
  const [open, setOpen] = useState(false),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const router = useRouter();
  function change(next: ProductStatus) {
    if (
      !window.confirm(
        `${next === "ARCHIVED" ? "Arsipkan" : next === "PUBLISHED" ? "Terbitkan" : "Jadikan draft"} produk “${name}”?`,
      )
    )
      return;
    start(async () => {
      const result = await setProductStatusAction(id, updatedAt, next);
      setError(result.error || "");
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }
  function remove() {
    if (
      !window.confirm(
        `Hapus produk “${name}”? Produk dihapus dari katalog dan inventori. Riwayat pesanan tetap ada tanpa foto. Tindakan ini tidak dapat dibatalkan.`,
      )
    )
      return;
    start(async () => {
      const result = await deleteProductAction(id, updatedAt);
      setError(result.ok ? "" : result.error || "Penghapusan gagal.");
      if (result.ok && result.data) {
        setOpen(false);
        window.alert(result.data.message);
        router.refresh();
      }
    });
  }
  const label = { DRAFT: "Draft", PUBLISHED: "Terbit", ARCHIVED: "Arsip" }[
    status
  ];
  return (
    <div className="min-w-0">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label={`Aksi ${name}`}
            className="flex min-h-11 w-11 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2"
          >
            <MoreHorizontal size={22} aria-hidden="true" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="product-actions-overlay" />
          <Dialog.Content
            className="product-actions-sheet"
            aria-describedby={undefined}
          >
            <div className="product-actions-grip" aria-hidden="true" />
            <header className="product-actions-heading">
              {image ? (
                <img src={image} alt="" />
              ) : (
                <span className="product-actions-placeholder">
                  <Package size={22} />
                </span>
              )}
              <div>
                <Dialog.Title>{name}</Dialog.Title>
                <span className="product-list-status" data-status={status}>
                  {label}
                </span>
              </div>
              <Dialog.Close aria-label="Tutup tindakan produk">
                <X size={20} />
              </Dialog.Close>
            </header>
            <nav
              aria-label={`Tindakan ${name}`}
              className="product-actions-items"
            >
              <Link
                href={`/admin/products/${id}`}
                onClick={() => setOpen(false)}
              >
                <Pencil size={19} />
                {canUpdate ? "Edit produk" : "Detail produk"}
              </Link>
              {status === "PUBLISHED" ? (
                <Link href={`/product/${slug}`} onClick={() => setOpen(false)}>
                  <Store size={19} />
                  Lihat di toko
                </Link>
              ) : (
                <span className="product-action-disabled">
                  <Store size={19} />
                  <span>
                    Lihat di toko<small>Produk belum diterbitkan</small>
                  </span>
                </span>
              )}
              {canUpdate && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    change(status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")
                  }
                >
                  <Upload size={19} />
                  {status === "PUBLISHED"
                    ? "Jadikan draft"
                    : "Terbitkan produk"}
                </button>
              )}
              {canDelete && status !== "ARCHIVED" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => change("ARCHIVED")}
                >
                  <Archive size={19} />
                  Arsipkan produk
                </button>
              )}
              {canDelete && (
                <button type="button" disabled={pending} onClick={remove}>
                  <Trash2 size={19} />
                  Hapus produk
                </button>
              )}
            </nav>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
