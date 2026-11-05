import type { OrderStatus, ShipmentStatus } from "@prisma/client";
import { OperationForm } from "./operation-form";

export function ShipmentForm({ orderId, orderStatus, allowed, initial }: {
  orderId: string;
  orderStatus: OrderStatus;
  allowed: ShipmentStatus[];
  initial?: {
    courier: string | null; service: string | null; cost: number;
    trackingNumber: string | null; status: ShipmentStatus; notes: string | null;
    shippedDate: Date | null; estimatedDelivery: Date | null;
  } | null;
}) {
  if (!allowed.length) return <p className="text-sm text-ink-soft">Tidak ada tindakan pengiriman yang tersedia pada status ini.</p>;
  const isPacked = orderStatus === "PACKED";
  const trackingVisible = !["PAID", "PROCESSING"].includes(orderStatus);
  const initialStatus = allowed.includes(initial?.status as ShipmentStatus) ? initial!.status : allowed[0];

  return <div className="space-y-4">
    {isPacked && <p className="rounded-xl border border-line bg-surface p-3 text-sm" role="note" data-testid="tracking-auto-dispatch-info">
      Paket sudah dikemas. Masukkan nomor resi <strong>hanya setelah paket diserahkan ke kurir</strong>.
      Saat disimpan, status pesanan dan pengiriman otomatis menjadi <strong>Dikirim</strong>.
    </p>}
    {initial?.shippedDate && <p className="text-sm text-ink-soft">Waktu pengiriman tercatat: {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(initial.shippedDate)} (WIB). Waktu ini tidak dapat diubah lewat form.</p>}
    <OperationForm url="/api/v1/admin/shipments" label="Simpan pengiriman"
      confirmation={isPacked
        ? "Pastikan paket benar-benar telah diserahkan ke kurir. Menyimpan nomor resi otomatis mengubah status menjadi Dikirim; aplikasi tidak memanggil API kurir."
        : "Simpan progres pengiriman manual? Ini tidak memanggil API kurir."}
      requestId fields={[
        { name: "orderId", label: "Order", type: "hidden", value: orderId },
        { name: "courier", label: "Kurir", required: true, value: initial?.courier || "", maxLength: 100 },
        { name: "service", label: "Layanan", required: true, value: initial?.service || "", maxLength: 100 },
        { name: "cost", label: "Ongkir tercatat (Rp)", type: "number", required: true, value: initial?.cost || 0, min: 0, max: 2147483647, hint: "Tidak mengubah tagihan atau total order." },
        ...(trackingVisible ? [{
          name: "trackingNumber", label: "Nomor resi", value: initial?.trackingNumber || "", maxLength: 160,
          hint: isPacked ? "Wajib isi setelah serah-terima fisik; status Dikirim akan otomatis tersimpan." : "Nomor resi pengiriman.",
        }] : []),
        { name: "status", label: "Status pengiriman", type: isPacked ? "hidden" as const : "select" as const,
          value: initialStatus, required: true, options: allowed.map(status => ({ value: status, label: status })) },
        { name: "estimatedDelivery", label: "Estimasi tiba", type: "date", value: initial?.estimatedDelivery?.toISOString().slice(0, 10) },
        { name: "notes", label: "Catatan pengiriman", type: "textarea", value: initial?.notes || "" },
      ]} />
  </div>;
}
