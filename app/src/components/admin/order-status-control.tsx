import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { OperationForm } from "./operation-form";
export function OrderStatusControl({ orderId, allowed }: { orderId: string; allowed: OrderStatus[] }) {
  if (!allowed.length) return <p className="text-sm text-ink-soft">Tidak ada transisi order umum yang tersedia. Gunakan alur pembayaran atau pengiriman bila diperlukan.</p>;
  return <OperationForm key={allowed.join(",")} url={`/api/v1/admin/orders/${orderId}/status`} label="Ubah status order" confirmation="Terapkan perubahan status pesanan? Pembatalan sebelum pembayaran akan melepaskan reservasi stok." fields={[{ name: "status", label: "Status baru", type: "select", value: allowed[0], required: true, options: allowed.map(s => ({ value: s, label: ORDER_STATUS_LABEL[s] })) }]} />;
}
