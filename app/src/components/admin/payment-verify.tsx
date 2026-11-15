import { formatIDR } from "@/lib/money";
import { OperationForm } from "./operation-form";
import Link from "next/link";
import { BLU_CHECKOUT_METHOD } from "@/modules/payments/evidence/blu-checkout";
export function PaymentVerify({
  paymentId,
  amount,
  method,
}: {
  paymentId: string;
  amount?: number;
  method?: string;
}) {
  if (method === BLU_CHECKOUT_METHOD) return <Link className="inline-flex min-h-11 items-center rounded-xl bg-black px-4 text-sm font-medium text-white"
    href={`/admin/payments/evidence?paymentId=${encodeURIComponent(paymentId)}`}>Periksa notifikasi blu dan mutasi bank</Link>;
  return (
    <div
      data-testid={`payment-verify-${paymentId}`}
      className="flow-payment-actions"
    >
      <OperationForm
        url={`/api/v1/admin/payments/${paymentId}/approve`}
        label="Terima pembayaran"
        confirmation={`Pastikan dana ${amount === undefined ? "pembeli" : formatIDR(amount)} sudah masuk ke rekening Anda. Bukti unggah pembeli bukan konfirmasi dari bank. Reservasi stok akan dicatat sebagai penjualan.`}
        fields={[]}
      />
      <details>
        <summary>Minta perbaikan</summary>
        <OperationForm
          url={`/api/v1/admin/payments/${paymentId}/reject`}
          label="Kirim permintaan perbaikan"
          confirmation="Minta pembeli memperbaiki bukti tanpa meminta pembayaran ulang otomatis?"
          fields={[
            {
              name: "reason",
              label: "Alasan perbaikan (wajib)",
              type: "textarea",
              required: true,
              maxLength: 1500,
            },
          ]}
        />
      </details>
    </div>
  );
}
