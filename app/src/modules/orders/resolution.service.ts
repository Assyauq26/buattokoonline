import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { lockOrder, assertStaffPermission } from "./transaction-locks";
import { releaseStock } from "@/modules/inventory/inventory.service";
import { activeRefund } from "@/modules/payments/refund-state";
import { writeAudit } from "@/modules/audit/audit.service";
import {
  requestResolutionSchema,
  resolutionCommandSchema,
  selectedItemsSchema,
  discountedLines,
  lineRefund,
  refundBankSchema,
  terminalResolutionStates,
} from "./resolution-policy";
import { openRefundBank, sealRefundBank } from "./refund-bank";
import { putObject, removeObject, STORAGE_APP } from "@/lib/storage";
import { validatePaymentProof } from "@/modules/payments/payment-proof-validation";

const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const include = {
  items: { orderBy: { variantId: "asc" as const } },
  payment: { include: { events: true, confirmations: true } },
  shipment: true,
  jntShipmentRequest: true,
  resolutions: { include: { transfer: true } },
} satisfies Prisma.OrderInclude;
type Order = Prisma.OrderGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;
type Case = Order["resolutions"][number];
export type ResolutionActor = { id: string; staff: boolean };
const fail = (message: string): never => {
  throw new HttpError(message, 409);
};
async function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  try {
    return await prisma.$transaction(fn, { timeout: 15000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new HttpError(
        "Permintaan atau referensi sudah dipakai. Muat ulang status kasus.",
        409,
      );
    throw e;
  }
}
async function authorize(
  tx: Tx,
  o: Order,
  a: ResolutionActor,
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
) {
  const u = await tx.user.findUnique({
    where: { id: a.id },
    select: { isActive: true },
  });
  if (!u?.isActive) throw new HttpError("Sesi tidak tersedia", 401);
  if (a.staff) await assertStaffPermission(tx, a.id, permission);
  else if (o.userId !== a.id)
    throw new HttpError("Pesanan tidak ditemukan", 404);
}
async function context(
  tx: Tx,
  orderId: string,
  a: ResolutionActor,
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
) {
  await lockOrder(tx, orderId);
  const o = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include,
  });
  await authorize(tx, o, a, permission);
  return o;
}
async function event(
  tx: Tx,
  c: Case,
  a: ResolutionActor,
  action: string,
  note: string,
) {
  await tx.orderResolutionEvent.create({
    data: { resolutionId: c.id, actorId: a.id, action, note },
  });
  await tx.notification.create({
    data: {
      userId: (
        await tx.order.findUniqueOrThrow({
          where: { id: c.orderId },
          select: { userId: true },
        })
      ).userId,
      type: "order",
      title: "Pembaruan pembatalan / retur",
      body: note,
    },
  });
  await writeAudit(
    {
      userId: a.id,
      action: `order.resolution.${action}`,
      entity: "OrderResolution",
      entityId: c.id,
      meta: { orderId: c.orderId, from: c.state },
    },
    tx,
  );
}
function paid(o: Order) {
  return (
    o.payment?.provider === "manual" &&
    o.payment.status === "PAID" &&
    o.paymentStatus === "PAID"
  );
}
function leftWarehouse(o: Order) {
  return (
    !!o.shipment?.sellerHandoverAt ||
    !!o.shipment?.shippedDate ||
    ["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(o.shipment?.status || "") ||
    ["SHIPPED", "DELIVERED", "COMPLETED"].includes(o.status)
  );
}
function activeShipment(o: Order) {
  return (
    ["PREPARED", "DISPATCHED", "UNKNOWN", "SUCCEEDED"].includes(
      o.jntShipmentRequest?.state || "",
    ) || !!(o.shipment && !o.shipment.cancelledAt && o.shipment.trackingNumber)
  );
}
function amounts(o: Order, exclude?: string) {
  const legacy = o.payment?.events.some((e) => e.type === "REFUND_CONFIRMED");
  const committed = o.resolutions.filter(
    (c) =>
      c.id !== exclude &&
      !["REJECTED", "CANCELLED_NO_REFUND"].includes(c.state),
  );
  return {
    committed,
    previous: legacy
      ? o.payment?.amount || 0
      : committed.reduce((n, c) => n + c.refundAmount, 0),
    remaining: Math.max(
      0,
      (o.payment?.amount || 0) -
        (legacy
          ? o.payment?.amount || 0
          : committed.reduce((n, c) => n + c.refundAmount, 0)),
    ),
  };
}
async function restock(
  tx: Tx,
  o: Order,
  c: Case,
  items: z.infer<typeof selectedItemsSchema>,
) {
  if (c.stockRestored) return;
  for (const original of o.items) {
    const qty = items.find((i) => i.orderItemId === original.id)?.quantity || 0;
    if (!qty) continue;
    const count = await tx.$executeRaw(
      Prisma.sql`UPDATE "Inventory" SET "onHand"="onHand"+${qty},"updatedAt"=NOW() WHERE "variantId"=${original.variantId} AND "reserved">=0 AND "onHand">="reserved" AND "onHand"<=${2147483647 - qty}`,
    );
    if (count !== 1)
      fail("Stok tidak konsisten; periksa gudang sebelum melanjutkan");
    await tx.inventoryMovement.create({
      data: {
        variantId: original.variantId,
        type: "RETURN",
        quantity: qty,
        reference: c.id,
        note: "Barang diperiksa / pembatalan sebelum keluar gudang",
      },
    });
  }
}
export async function requestResolution(
  orderId: string,
  a: ResolutionActor,
  value: unknown,
) {
  const input = requestResolutionSchema.parse(value);
  return transaction(async (tx) => {
    const o = await context(
      tx,
      orderId,
      a,
      input.kind === "CANCEL"
        ? PERMISSIONS.ORDER_CANCEL
        : PERMISSIONS.PAYMENT_VERIFY,
    );
    if (!a.staff && input.kind === "CANCEL")
      throw new HttpError("Hubungi toko untuk membatalkan transaksi", 403);
    const prior = await tx.orderResolution.findUnique({
      where: { requestKey: input.requestId },
    });
    if (prior) {
      if (
        prior.orderId !== orderId ||
        prior.createdBy !== a.id ||
        prior.fingerprint !== hash(input)
      )
        fail("Identitas permintaan telah digunakan");
      return { id: prior.id };
    }
    if (o.resolutions.some((c) => !terminalResolutionStates.includes(c.state)))
      fail("Sudah ada kasus aktif. Lanjutkan kasus tersebut.");
    if (o.payment && (await activeRefund(tx, o.payment.id)))
      fail("Selesaikan ledger refund sebelumnya dahulu");
    if (
      input.kind === "CANCEL" &&
      (["CANCELLED", "EXPIRED", "REFUNDED"].includes(o.status) ||
        leftWarehouse(o))
    )
      fail("Pesanan sudah keluar gudang atau ditutup; gunakan retur/refund");
    if (input.kind === "RETURN" && !paid(o))
      fail("Retur/refund memerlukan dana terverifikasi");
    if (input.kind === "RETURN" && !leftWarehouse(o))
      fail("Sebelum paket diserahkan, gunakan pembatalan pesanan melalui toko");
    const c = await tx.orderResolution.create({
      data: {
        orderId,
        requestKey: input.requestId,
        fingerprint: hash(input),
        kind: input.kind,
        state: "REVIEW",
        reason: input.reason,
        items: [],
        createdBy: a.id,
      },
      include: { transfer: true },
    });
    await event(tx, c, a, "requested", input.reason);
    return { id: c.id };
  });
}
async function loadCase(
  tx: Tx,
  id: string,
  a: ResolutionActor,
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
) {
  const found = await tx.orderResolution.findUnique({
    where: { id },
    select: { orderId: true },
  });
  if (!found) throw new HttpError("Kasus tidak ditemukan", 404);
  const o = await context(tx, found.orderId, a, permission);
  return { o, c: o.resolutions.find((c) => c.id === id)! };
}
export async function commandResolution(
  id: string,
  a: ResolutionActor,
  value: unknown,
) {
  const input = resolutionCommandSchema.parse(value);
  return transaction(async (tx) => {
    const customerOnly = [
      "bank",
      "return-shipped",
      "received",
      "dispute",
    ].includes(input.action);
    // Owner identity, rather than a role label, authorizes buyer acknowledgements.
    const effectiveActor = customerOnly ? { ...a, staff: false } : a;
    if (!customerOnly && !a.staff)
      throw new HttpError("Akses pengelola diperlukan", 403);
    const permission =
      input.action === "confirm-cancel"
        ? PERMISSIONS.ORDER_CANCEL
        : input.action === "inspect-return"
          ? PERMISSIONS.INVENTORY_ADJUST
          : PERMISSIONS.PAYMENT_VERIFY;
    const { o, c } = await loadCase(tx, id, effectiveActor, permission);
    if (c.revision !== input.revision)
      fail("Status berubah. Muat ulang sebelum melanjutkan.");
    if (terminalResolutionStates.includes(c.state)) fail("Kasus telah ditutup");
    let data: Prisma.OrderResolutionUpdateInput = {
      revision: { increment: 1 },
    };
    let note = "";
    if (input.action === "confirm-cancel") {
      if (
        c.kind !== "CANCEL" ||
        !["REVIEW", "WAITING_PAYMENT", "WAITING_SHIPMENT"].includes(c.state)
      )
        fail("Kasus tidak menerima pembatalan");
      if (leftWarehouse(o))
        fail(
          "Paket telah diserahkan. Selesaikan kasus ini melalui penolakan beralasan, kemudian gunakan retur.",
        );
      const proof = o.payment?.confirmations.length;
      if (
        !paid(o) &&
        proof &&
        !(input.fundsReview === "NOT_RECEIVED" && input.attested)
      ) {
        data.state = "WAITING_PAYMENT";
        note =
          "Pembatalan menunggu pemeriksaan dana. Periksa mutasi dan bukti pembayaran.";
      } else if (activeShipment(o)) {
        data.state = "WAITING_SHIPMENT";
        note =
          "Pembatalan menunggu kepastian resi. Batalkan resi melalui menu Pengiriman sebelum konfirmasi ulang.";
      } else if (paid(o)) {
        await assertStaffPermission(tx, a.id, PERMISSIONS.PAYMENT_VERIFY);
        const budget = amounts(o, c.id);
        if (budget.previous !== 0 || o.total !== o.payment!.amount)
          fail("Pembatalan penuh memerlukan rekonsiliasi refund sebelumnya");
        const lines = discountedLines(o.items, o.discount);
        const products = lines.reduce((n, l) => n + l.net, 0);
        if (products + o.shippingCost !== o.total)
          fail("Snapshot total tidak konsisten");
        data = {
          ...data,
          state: c.bankCipher ? "READY" : "WAITING_BANK",
          productsAmount: products,
          shippingAmount: o.shippingCost,
          refundAmount: o.total,
          items: o.items.map((i) => ({
            orderItemId: i.id,
            quantity: i.quantity,
          })),
          stockRestored: true,
        };
        await restock(
          tx,
          o,
          c,
          o.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
        );
        await tx.order.update({
          where: { id: o.id },
          data: { status: "CANCELLED" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: o.id,
            fromStatus: o.status,
            toStatus: "CANCELLED",
            createdBy: a.id,
            note: c.reason,
          },
        });
        note =
          "Pesanan dibatalkan. Refund penuh termasuk ongkir diperlukan; dana belum dikembalikan.";
      } else {
        if (
          o.status !== "PENDING_PAYMENT" ||
          !["PENDING_PAYMENT", "REJECTED", "WAITING_VERIFICATION"].includes(
            o.payment?.status || "",
          )
        )
          fail("Pembayaran perlu direkonsiliasi");
        if (proof) {
          await assertStaffPermission(tx, a.id, PERMISSIONS.PAYMENT_VERIFY);
          if (!input.attested || input.fundsReview !== "NOT_RECEIVED")
            fail("Pemeriksaan dana diperlukan");
        }
        for (const i of o.items)
          await releaseStock(tx, i.variantId, i.quantity, o.orderNumber);
        await tx.payment.update({
          where: { orderId: o.id },
          data: { status: "EXPIRED" },
        });
        await tx.order.update({
          where: { id: o.id },
          data: { status: "CANCELLED", paymentStatus: "EXPIRED" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: o.id,
            fromStatus: o.status,
            toStatus: "CANCELLED",
            createdBy: a.id,
            note: c.reason,
          },
        });
        data.state = "CANCELLED_NO_REFUND";
        data.stockRestored = true;
        note =
          "Pesanan dibatalkan setelah pemeriksaan dana; reservasi dilepas. Tidak ada refund yang dicatat.";
      }
    } else if (input.action === "approve-return") {
      if (c.kind !== "RETURN" || c.state !== "REVIEW" || !paid(o))
        fail("Kasus tidak menerima keputusan refund");
      if (o.payment && (await activeRefund(tx, o.payment.id)))
        fail("Selesaikan refund sebelumnya");
      const budget = amounts(o, c.id),
        lines = discountedLines(o.items, o.discount);
      let products = 0;
      for (const i of input.items) {
        const line = lines.find((l) => l.id === i.orderItemId);
        if (!line) fail("Item bukan milik pesanan");
        const used = budget.committed
          .flatMap((c) => selectedItemsSchema.parse(c.items))
          .filter((x) => x.orderItemId === i.orderItemId)
          .reduce((n, x) => n + x.quantity, 0);
        if (used + i.quantity > line!.quantity)
          fail("Kuantitas melebihi sisa produk yang dapat direfund");
        products += lineRefund(line!.net, line!.quantity, used, i.quantity);
      }
      const previousShipping = budget.committed.reduce(
        (n, c) => n + c.shippingAmount,
        0,
      );
      if (
        input.shippingAmount + previousShipping > o.shippingCost ||
        products + input.shippingAmount > budget.remaining ||
        products + input.shippingAmount < 1
      )
        fail("Nominal melebihi sisa dana yang dapat dikembalikan");
      data = {
        ...data,
        state: input.returnRequired
          ? "WAITING_RETURN"
          : c.bankCipher
            ? "READY"
            : "WAITING_BANK",
        returnState: input.returnRequired ? "REQUIRED" : "NONE",
        items: input.items,
        productsAmount: products,
        shippingAmount: input.shippingAmount,
        refundAmount: products + input.shippingAmount,
        policyReason: input.policyReason,
      };
      note =
        "Retur/refund disetujui sesuai rincian kebijakan: " +
        input.policyReason;
    } else if (input.action === "reject") {
      if (!["REVIEW", "WAITING_PAYMENT", "WAITING_SHIPMENT"].includes(c.state))
        fail("Kewajiban refund tidak dapat ditolak setelah disetujui");
      data.state = "REJECTED";
      note = "Permintaan ditolak: " + input.reason;
      data.policyReason = input.reason;
    } else if (input.action === "prepare-transfer") {
      if (
        c.state !== "READY" ||
        !c.bankCipher ||
        !c.bankDigest ||
        c.transfer ||
        !paid(o)
      )
        fail("Refund belum siap ditinjau untuk transfer");
      data.state = "TRANSFER_PENDING";
      note =
        "Seller meninjau dan mengunci rekening serta nominal sebelum transfer manual. Jika hasil belum pasti, periksa transfer pertama; jangan transfer ulang.";
    } else if (input.action === "bank") {
      if (
        !["WAITING_BANK", "WAITING_RETURN", "READY"].includes(c.state) ||
        c.transfer
      )
        fail("Rekening tidak dapat diubah pada tahap ini");
      data.bankCipher = sealRefundBank(input.bank, c.id);
      data.bankDigest = hash(input.bank);
      if (c.state !== "WAITING_RETURN") data.state = "READY";
      note =
        "Pembeli menyimpan rekening tujuan refund. Tidak ada transfer otomatis.";
    } else if (input.action === "return-shipped") {
      if (
        c.state !== "WAITING_RETURN" ||
        !["REQUIRED", "IN_TRANSIT"].includes(c.returnState)
      )
        fail("Kasus tidak menunggu barang retur");
      data.returnState = "IN_TRANSIT";
      data.returnTracking = input.tracking;
      note = "Pembeli mencatat resi retur: " + input.tracking;
    } else if (input.action === "inspect-return") {
      if (
        c.state !== "WAITING_RETURN" ||
        !["REQUIRED", "IN_TRANSIT"].includes(c.returnState)
      )
        fail("Barang retur tidak menunggu pemeriksaan");
      if (input.restock) {
        await restock(tx, o, c, selectedItemsSchema.parse(c.items));
        data.stockRestored = true;
      }
      data.returnState = "INSPECTED";
      data.state = c.bankCipher ? "READY" : "WAITING_BANK";
      note = `Barang retur diterima dan diperiksa. ${input.restock ? "Stok layak jual ditambahkan." : "Tidak ditambahkan ke stok jual."} ${input.note}`;
    } else if (input.action === "received") {
      if (c.state !== "TRANSFER_RECORDED" && c.state !== "DISPUTED")
        fail("Belum ada transfer yang dicatat");
      data.state = "RECEIVED";
      note = "Pembeli mengonfirmasi dana refund diterima.";
      const received =
        o.resolutions
          .filter((r) => r.id !== c.id && r.state === "RECEIVED")
          .reduce((n, r) => n + r.refundAmount, 0) + c.refundAmount;
      if (received === o.payment?.amount) {
        await tx.payment.update({
          where: { id: o.payment.id },
          data: { status: "REFUNDED" },
        });
        await tx.order.update({
          where: { id: o.id },
          data: { paymentStatus: "REFUNDED" },
        });
      }
    } else if (input.action === "dispute") {
      if (c.state !== "TRANSFER_RECORDED" && c.state !== "DISPUTED")
        fail("Belum ada transfer yang dicatat");
      data.state = "DISPUTED";
      note = "Dana belum diterima / perlu tindak lanjut: " + input.reason;
    } else {
      if (
        c.state !== "DISPUTED" &&
        c.state !== "TRANSFER_RECORDED" &&
        c.state !== "TRANSFER_PENDING"
      )
        fail("Kasus belum memerlukan tindak lanjut transfer");
      note = input.note;
    }
    await tx.orderResolution.update({ where: { id }, data });
    await event(tx, c, a, input.action, note);
    return { id };
  });
}
const transferSchema = z
  .object({
    revision: z.coerce.number().int().nonnegative(),
    amount: z.coerce.number().int().positive(),
    reference: z.string().trim().min(5).max(160),
    settledAt: z.coerce.date(),
    attested: z.literal("true"),
  })
  .strict();
export async function uploadResolutionFile(
  id: string,
  a: ResolutionActor,
  kind: "transfer" | "evidence",
  fields: Record<string, string>,
  bytes: Uint8Array,
  mime: string,
) {
  const ext = validatePaymentProof(bytes, mime);
  const transfer = kind === "transfer" ? transferSchema.parse(fields) : null;
  // Authenticate and authorize before object writes, then repeat while holding Order lock.
  await transaction(async (tx) => {
    const { c } = await loadCase(
      tx,
      id,
      a,
      kind === "transfer" ? PERMISSIONS.PAYMENT_VERIFY : PERMISSIONS.ORDER_READ,
    );
    if (terminalResolutionStates.includes(c.state)) fail("Kasus ditutup");
    if (kind === "transfer" && !a.staff)
      throw new HttpError("Akses finansial diperlukan", 403);
  });
  const path = `${STORAGE_APP}/payment-proofs/${id}/${randomUUID()}.${ext}`;
  await putObject(path, bytes, mime);
  try {
    return await transaction(async (tx) => {
      const { o, c } = await loadCase(
        tx,
        id,
        a,
        kind === "transfer"
          ? PERMISSIONS.PAYMENT_VERIFY
          : PERMISSIONS.ORDER_READ,
      );
      if (terminalResolutionStates.includes(c.state)) fail("Kasus ditutup");
      if (transfer) {
        if (
          c.revision !== transfer.revision ||
          c.state !== "TRANSFER_PENDING" ||
          !c.bankCipher ||
          !c.bankDigest ||
          c.transfer
        )
          fail("Status berubah atau transfer sudah dicatat. Muat ulang.");
        if (
          !paid(o) ||
          c.refundAmount !== transfer.amount ||
          transfer.amount > amounts(o, c.id).remaining
        )
          fail("Nominal tidak sesuai kewajiban / sisa dana");
        if (
          transfer.settledAt < o.createdAt ||
          +transfer.settledAt > Date.now() + 300000
        )
          fail("Tanggal transfer tidak valid");
        await tx.resolutionTransfer.create({
          data: {
            resolutionId: id,
            amount: transfer.amount,
            reference: transfer.reference,
            referenceDigest: hash(
              transfer.reference.replace(/\s/g, "").toUpperCase(),
            ),
            bankDigest: c.bankDigest!,
            proofPath: path,
            proofMime: mime,
            proofHash: hash(Array.from(bytes)),
            settledAt: transfer.settledAt,
            recordedBy: a.id,
          },
        });
        await tx.orderResolution.update({
          where: { id },
          data: { state: "TRANSFER_RECORDED", revision: { increment: 1 } },
        });
        await event(
          tx,
          c,
          a,
          "transfer-recorded",
          "Seller mencatat transfer refund. Menunggu konfirmasi pembeli; unggahan bukan verifikasi bank otomatis.",
        );
      } else {
        if (
          (await tx.resolutionEvidence.count({
            where: { resolutionId: id },
          })) >= 10
        )
          fail("Maksimal 10 bukti per kasus");
        await tx.resolutionEvidence.create({
          data: {
            resolutionId: id,
            proofPath: path,
            proofMime: mime,
            proofHash: hash(Array.from(bytes)),
            createdBy: a.id,
          },
        });
        await event(tx, c, a, "evidence", "Bukti pendukung ditambahkan.");
      }
      return { id };
    });
  } catch (e) {
    try {
      await removeObject(path);
    } catch {
      console.error("[storage] Resolution proof compensation failed");
    }
    throw e;
  }
}
export async function resolutionView(orderId: string, a: ResolutionActor) {
  return transaction(async (tx) => {
    const o = await context(tx, orderId, a, PERMISSIONS.ORDER_READ);
    let finance = !a.staff;
    if (a.staff) {
      try {
        await assertStaffPermission(tx, a.id, PERMISSIONS.PAYMENT_READ);
        finance = true;
      } catch {
        finance = false;
      }
    }
    const cases = await tx.orderResolution.findMany({
      where: { orderId },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        transfer: true,
        evidence: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    const budget = amounts(o);
    const lines = discountedLines(o.items, o.discount);
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      orderStatus: o.status,
      paymentStatus: o.paymentStatus,
      paid: paid(o),
      shipmentActive: activeShipment(o),
      leftWarehouse: leftWarehouse(o),
      total: o.total,
      discount: o.discount,
      shippingCost: o.shippingCost,
      previous: budget.previous,
      remaining: paid(o) ? budget.remaining : 0,
      items: o.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        net: lines.find((l) => l.id === i.id)!.net,
      })),
      cases: cases.map((c) => ({
        id: c.id,
        kind: c.kind,
        state: c.state,
        reason: c.reason,
        policyReason: c.policyReason,
        revision: c.revision,
        productsAmount: c.productsAmount,
        shippingAmount: c.shippingAmount,
        refundAmount: c.refundAmount,
        items: c.items,
        returnState: c.returnState,
        returnTracking: c.returnTracking,
        stockRestored: c.stockRestored,
        createdAt: c.createdAt,
        bank:
          finance && c.bankCipher
            ? refundBankSchema.parse(openRefundBank(c.bankCipher, c.id))
            : null,
        hasBank: !!c.bankCipher,
        events: c.events.map((e) => ({
          id: e.id,
          action: e.action,
          note: e.note,
          createdAt: e.createdAt,
        })),
        evidence: c.evidence.map((e) => ({ id: e.id, createdAt: e.createdAt })),
        transfer:
          finance && c.transfer
            ? {
                id: c.transfer.id,
                amount: c.transfer.amount,
                reference: c.transfer.reference,
                settledAt: c.transfer.settledAt,
                createdAt: c.transfer.createdAt,
              }
            : null,
      })),
    };
  });
}
export async function resolutionProof(
  id: string,
  a: ResolutionActor,
  kind: "transfer" | "evidence",
) {
  return transaction(async (tx) => {
    const proof =
      kind === "transfer"
        ? await tx.resolutionTransfer.findUnique({ where: { id } })
        : await tx.resolutionEvidence.findUnique({ where: { id } });
    if (!proof) throw new HttpError("Bukti tidak ditemukan", 404);
    await loadCase(
      tx,
      proof.resolutionId,
      a,
      kind === "transfer" ? PERMISSIONS.PAYMENT_READ : PERMISSIONS.ORDER_READ,
    );
    return { path: proof.proofPath, mime: proof.proofMime };
  });
}
