const reasons: Readonly<Record<string, string>> = {
  MISSING_STABLE_TRANSACTION_ID: "Identitas transaksi belum memadai.",
  UNVERIFIED_PROVENANCE: "Keaslian sumber pembayaran belum terverifikasi.",
  ACCOUNT_MISMATCH: "Rekening atau merchant penerima berbeda.",
  NON_IDR_OR_NON_CREDIT: "Transaksi bukan dana masuk dalam rupiah.",
  REFUND_OR_REVERSAL: "Transaksi berupa pengembalian atau pembalikan dana.",
  UNKNOWN_OR_UNSETTLED_STATUS:
    "Status transaksi belum dapat dipastikan selesai.",
  INVALID_AMOUNT: "Nominal transaksi belum valid.",
  INVALID_TIME: "Waktu transaksi belum valid.",
  SELLER_REVIEW_REQUIRED:
    "Periksa mutasi dan hubungan transaksi dengan pembeli secara langsung.",
  SOURCE_CHANGED_REQUIRES_REVIEW:
    "Data sumber berubah. Periksa kemungkinan koreksi atau pengembalian dana.",
};
export function evidenceReasonLabel(reason: string) {
  return reasons[reason] || "Transaksi memerlukan pemeriksaan terpisah.";
}
