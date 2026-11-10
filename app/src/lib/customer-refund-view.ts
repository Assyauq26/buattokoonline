export type CustomerRefund = {
  state: string;
  refundAmount: number;
  hasBank?: boolean;
};
export function customerRefundView(c: CustomerRefund) {
  const approved =
    c.refundAmount > 0 &&
    [
      "WAITING_BANK",
      "WAITING_RETURN",
      "READY",
      "TRANSFER_PENDING",
      "TRANSFER_RECORDED",
      "DISPUTED",
      "RECEIVED",
    ].includes(c.state);
  const labels: Record<string, string> = {
    WAITING_BANK: "Menunggu rekening",
    READY: "Menunggu pengembalian dana",
    TRANSFER_PENDING: "Pengembalian sedang diproses",
    TRANSFER_RECORDED: "Transfer dicatat penjual",
    DISPUTED: "Kendala pengembalian dana",
    RECEIVED: "Penerimaan dana dikonfirmasi",
    WAITING_RETURN: "Menunggu pemeriksaan retur",
    REVIEW: "Menunggu keputusan penjual",
    WAITING_PAYMENT: "Pembayaran sedang diperiksa",
    WAITING_SHIPMENT: "Pembatalan pengiriman diproses",
    REJECTED: "Permintaan tidak disetujui",
    CANCELLED_NO_REFUND: "Pesanan dibatalkan",
  };
  const descriptions: Record<string, string> = {
    WAITING_BANK: "Input nomor rekening untuk menerima pengembalian dana",
    READY: "Rekening berhasil disimpan. Menunggu proses dari penjual.",
    TRANSFER_PENDING:
      "Penjual sedang memproses pengembalian. Rekening tidak dapat diubah.",
    TRANSFER_RECORDED:
      "Penjual telah mencatat transfer. Periksa rekening Anda sebelum mengonfirmasi penerimaan.",
    DISPUTED: "Kendala Anda sedang ditangani penjual.",
    RECEIVED: "Anda telah mengonfirmasi dana diterima.",
    WAITING_RETURN:
      "Pengembalian dana menunggu barang retur diperiksa penjual.",
    REVIEW:
      "Penjual akan memeriksa permintaan Anda sebelum memberikan keputusan.",
    WAITING_PAYMENT: "Penjual sedang memeriksa pembayaran pesanan.",
    WAITING_SHIPMENT: "Menunggu hasil pembatalan pengiriman.",
    REJECTED: "Lihat alasan keputusan penjual pada riwayat.",
    CANCELLED_NO_REFUND:
      "Tidak ada pengembalian dana yang disetujui untuk pesanan ini.",
  };
  return {
    approved,
    label: labels[c.state] || "Menunggu pembaruan",
    description:
      descriptions[c.state] || "Periksa kembali status pengembalian Anda.",
    canEditBank:
      approved && ["WAITING_BANK", "WAITING_RETURN", "READY"].includes(c.state),
    needsBank: approved && c.state === "WAITING_BANK",
    received: c.state === "RECEIVED",
  };
}
export const maskBankNumber = (number: string) => "•••• " + number.slice(-4);
export function customerRefundEvent(action: string, note: string) {
  const labels: Record<string, string> = {
    bank: "Rekening pengembalian disimpan",
    "prepare-transfer": "Penjual mulai memproses pengembalian",
    "transfer-recorded": "Penjual mencatat transfer",
    received: "Anda mengonfirmasi dana diterima",
    dispute: "Kendala pengembalian dilaporkan",
    "confirm-cancel": "Pesanan dibatalkan",
    "approve-return": "Pengembalian disetujui",
    "return-shipped": "Pengiriman retur dicatat",
    "inspect-return": "Barang retur diperiksa",
    request: "Permintaan diterima",
  };
  return (
    labels[action] ||
    note
      .replace(/kasus/gi, "permintaan")
      .replace(/seller/gi, "penjual")
      .replace(/refund/gi, "pengembalian dana")
  );
}
