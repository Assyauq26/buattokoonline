"use client";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X } from "lucide-react";
export function OrderFilters({
  params,
}: {
  params: Record<string, string | undefined>;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="order-filter-trigger"
          aria-label="Filter pesanan"
        >
          <SlidersHorizontal size={20} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal
        container={
          typeof document !== "undefined"
            ? document.querySelector<HTMLElement>(".order-workflow")
            : undefined
        }
      >
        <Dialog.Overlay className="order-filter-overlay" />
        <Dialog.Content
          className="order-filter-sheet"
          aria-describedby={undefined}
        >
          <header>
            <Dialog.Title>Filter pesanan</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Tutup filter">
                <X size={22} />
              </button>
            </Dialog.Close>
          </header>
          <form action="/admin/orders" method="get">
            <input type="hidden" name="q" value={params.q || ""} />
            <input type="hidden" name="tab" value={params.tab || "all"} />
            <label>
              Status
              <select name="status" defaultValue={params.status || ""}>
                <option value="">Semua status</option>
                {[
                  "PENDING_PAYMENT",
                  "PAID",
                  "PROCESSING",
                  "PACKED",
                  "SHIPPED",
                  "DELIVERED",
                  "COMPLETED",
                  "CANCELLED",
                  "EXPIRED",
                  "REFUNDED",
                ].map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABEL[s as keyof typeof ORDER_STATUS_LABEL]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dari tanggal
              <input type="date" name="from" defaultValue={params.from} />
            </label>
            <label>
              Sampai tanggal
              <input type="date" name="to" defaultValue={params.to} />
            </label>
            <label>
              Metode pembayaran
              <select name="payment" defaultValue={params.payment || ""}>
                <option value="">Semua pembayaran</option>
                <option value="manual">Transfer bank manual</option>
              </select>
            </label>
            <label>
              Pengiriman
              <select name="shipping" defaultValue={params.shipping || ""}>
                <option value="">Semua pengiriman</option>
                <option value="issue">Kendala / retur kurir</option>
                <option value="pending">Hasil resi belum pasti</option>
                <option value="jnt">J&amp;T Express</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>
              Refund
              <select name="refund" defaultValue={params.refund || ""}>
                <option value="">Semua</option>
                <option value="active">
                  Kasus aktif / perlu tindak lanjut
                </option>
              </select>
            </label>
            <label>
              Urutan
              <select name="sort" defaultValue={params.sort || "newest"}>
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
              </select>
            </label>
            <footer>
              <Dialog.Close asChild>
                <Link href="/admin/orders">Reset</Link>
              </Dialog.Close>
              <button type="submit">Terapkan</button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
