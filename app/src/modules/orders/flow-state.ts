import type { Prisma } from "@prisma/client";
export type FlowOrder = {
  status: string;
  paymentStatus: string;
  shipment?: {
    status?: string | null;
    provider?: string;
    cancelledAt?: unknown;
    carrierCondition?: string | null;
    notes?: string | null;
  } | null;
  jntShipmentRequest?: {
    state?: string | null;
    errorCode?: string | null;
    awb?: string | null;
  } | null;
  resolutions?: {
    id?: string;
    state: string;
    refundAmount?: number;
    kind?: string;
  }[];
};
export const flowTabs = [
  ["all", "Semua"],
  ["payment", "Pembayaran"],
  ["ready", "Perlu disiapkan"],
  ["packing", "Dikemas"],
  ["pickup", "Menunggu pickup"],
  ["shipped", "Dikirim"],
  ["done", "Selesai"],
  ["return", "Retur"],
  ["cancelled", "Dibatalkan"],
] as const;
export const terminalCases = ["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"];
export function orderFlow(o: FlowOrder) {
  const active = o.resolutions?.find((c) => !terminalCases.includes(c.state));
  const req = o.jntShipmentRequest,
    s = o.shipment;
  let key = "payment",
    label = "Menunggu pembayaran",
    description = "Belum ada bukti pembayaran.",
    tone = "pending",
    action = "detail",
    cta = "Lihat detail";
  if (["CANCELLED", "REFUNDED", "EXPIRED"].includes(o.status)) {
    key = "cancelled";
    label = o.status === "EXPIRED" ? "Kedaluwarsa" : "Dibatalkan";
    description = "Pesanan tidak dilanjutkan.";
    tone = "muted";
  } else if (["RETURNING", "RETURNED"].includes(s?.carrierCondition || "")) {
    key = "return";
    label = "Retur";
    description =
      s?.carrierCondition === "RETURNED"
        ? "Diterima seller menurut tracking J&T. Periksa kondisi barang."
        : "Dalam perjalanan kembali.";
    action = req?.awb ? "track" : "detail";
    cta = req?.awb ? "Lacak retur" : "Lihat detail";
  } else if (
    ["DELIVERED", "COMPLETED"].includes(o.status) ||
    s?.status === "DELIVERED"
  ) {
    key = "done";
    label = "Selesai";
    description =
      "Paket diterima berdasarkan tracking / konfirmasi pengantaran.";
    tone = "success";
    action = "history";
    cta = "Lihat riwayat pengiriman";
  } else if (
    o.status === "SHIPPED" ||
    ["SHIPPED", "IN_TRANSIT"].includes(s?.status || "")
  ) {
    key = "shipped";
    label = "Dikirim";
    description = "Paket sedang dikirim.";
    tone = "success";
    action = "track";
    cta = "Lacak pengiriman";
  } else if (req?.state === "SUCCEEDED" && req.awb && !s?.cancelledAt) {
    key = "pickup";
    label = "Menunggu pickup";
    description = "Resi dibuat. Menunggu paket diterima J&T.";
    action = "print";
    cta = "Cetak AWB";
  } else if (["PROCESSING", "PACKED"].includes(o.status)) {
    key = "packing";
    label = "Sedang dikemas";
    description = "Paket sedang disiapkan.";
    action = "create";
    cta = req?.state === "CANCELLED" ? "Buat resi baru" : "Buat resi";
  } else if (o.status === "PAID") {
    key = "ready";
    label = "Pembayaran disetujui";
    description = "Pembayaran telah diterima. Lanjut siapkan paket.";
    tone = "success";
    action = "prepare";
    cta = "Siapkan paket";
  } else if (o.paymentStatus === "WAITING_VERIFICATION") {
    label = "Menunggu verifikasi";
    description = "Pembeli telah mengunggah bukti transfer.";
    action = "verify";
    cta = "Verifikasi pembayaran";
  } else if (o.paymentStatus === "REJECTED") {
    label = "Perlu perbaikan pembayaran";
    description = "Menunggu pembeli memperbaiki bukti pembayaran.";
  }
  let operation = "";
  if (req?.errorCode === "CREATION_REJECTED")
    operation = "Data pengiriman ditolak J&T. Perbaiki data lalu coba lagi.";
  else if (["PREPARED", "DISPATCHED"].includes(req?.state || ""))
    operation = "Membuat resi";
  if (req?.state === "UNKNOWN")
    operation =
      req.errorCode === "CANCELLATION_PENDING"
        ? "Menunggu kepastian pembatalan"
        : "Memeriksa hasil pembuatan resi";
  if (operation && req?.errorCode !== "CREATION_REJECTED") {
    action = "detail";
    cta = "Periksa hasil resi";
  }
  if (s?.notes?.startsWith("Tracking terakhir gagal"))
    operation = "Gagal memperbarui tracking";
  let financial = "";
  if (
    active &&
    (active.refundAmount || 0) > 0 &&
    [
      "WAITING_BANK",
      "READY",
      "TRANSFER_PENDING",
      "TRANSFER_RECORDED",
      "DISPUTED",
    ].includes(active.state)
  )
    financial = ["TRANSFER_PENDING", "TRANSFER_RECORDED", "DISPUTED"].includes(
      active.state,
    )
      ? "Refund sedang diproses"
      : "Refund perlu diproses";
  if (active && !(key === "return" && !(active.refundAmount || 0))) {
    action = "case";
    cta = "Lanjutkan penanganan";
  }
  if (
    o.paymentStatus === "REFUNDED" &&
    !["cancelled", "shipped", "done", "return"].includes(key)
  ) {
    label = "Refund selesai · Periksa pengiriman";
    description =
      "Dana sudah dikembalikan. Periksa kondisi resi; jangan kirim paket baru.";
    action = "detail";
    cta = "Lihat detail";
  }
  return {
    key,
    label,
    description,
    tone,
    action,
    cta,
    operation,
    financial,
    activeCaseId: active?.id,
  };
}

/** The same mutually exclusive predicates drive server pagination/counts and UI selectors. */
export function flowWhere(
  key: string,
  payment?: string,
): Prisma.OrderWhereInput {
  const live: Prisma.OrderWhereInput = {
    status: { notIn: ["CANCELLED", "REFUNDED", "EXPIRED"] },
  };
  const returning: Prisma.OrderWhereInput = {
    shipment: { is: { carrierCondition: { in: ["RETURNING", "RETURNED"] } } },
  };
  const travelling: Prisma.OrderWhereInput = {
    OR: [
      { status: "SHIPPED" },
      { shipment: { is: { status: { in: ["SHIPPED", "IN_TRANSIT"] } } } },
    ],
  };
  const done: Prisma.OrderWhereInput = {
    OR: [
      { status: { in: ["DELIVERED", "COMPLETED"] } },
      { shipment: { is: { status: "DELIVERED" } } },
    ],
  };
  const pickup: Prisma.OrderWhereInput = {
    jntShipmentRequest: { is: { state: "SUCCEEDED", awb: { not: null } } },
    OR: [
      { shipment: { is: null } },
      { shipment: { is: { cancelledAt: null } } },
    ],
  };
  const pre: Prisma.OrderWhereInput = {
    AND: [live, { NOT: returning }, { NOT: done }, { NOT: travelling }],
  };
  switch (key) {
    case "cancelled":
      return { NOT: live };
    case "return":
      return { AND: [live, returning] };
    case "done":
      return { AND: [live, { NOT: returning }, done] };
    case "shipped":
      return { AND: [live, { NOT: returning }, { NOT: done }, travelling] };
    case "pickup":
      return { AND: [pre, pickup] };
    case "ready":
      return { AND: [pre, { NOT: pickup }, { status: "PAID" }] };
    case "packing":
      return {
        AND: [
          pre,
          { NOT: pickup },
          { status: { in: ["PROCESSING", "PACKED"] } },
        ],
      };
    case "payment":
      return {
        AND: [
          pre,
          { NOT: pickup },
          { status: "PENDING_PAYMENT" },
          ...(["PENDING_PAYMENT", "WAITING_VERIFICATION", "REJECTED"].includes(
            payment || "",
          )
            ? [{ paymentStatus: payment as "REJECTED" }]
            : []),
        ],
      };
    default:
      return {};
  }
}
export function summarizeProducts(
  items: {
    productName: string;
    imageUrl?: string | null;
    quantity: number;
    variant?: { productId: string } | null;
    variantId?: string;
  }[],
) {
  const products = new Map<string, (typeof items)[number]>();
  for (const i of items)
    products.set(i.variant?.productId || i.variantId || i.productName, i);
  const distinct = [...products.values()],
    count = distinct.length;
  return {
    count,
    units: items.reduce((n, i) => n + i.quantity, 0),
    name: count === 1 ? distinct[0]?.productName : `${count} produk`,
    previews: count > 3 ? distinct.slice(0, 2) : distinct.slice(0, 3),
    remaining: count > 3 ? count - 2 : 0,
  };
}
