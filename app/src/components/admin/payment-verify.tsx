import { formatIDR } from "@/lib/money";
import { OperationForm } from "./operation-form";
export function PaymentVerify({
  paymentId,
  amount,
}: {
  paymentId: string;
  amount?: number;
}) {
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
