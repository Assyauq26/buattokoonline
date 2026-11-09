"use client";
import { AwbPrintButton } from "./awb-print-button";
import { ActionDialog } from "@/components/ui/action-dialog";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { OperationForm } from "./operation-form";
import { fulfillmentLabel } from "@/modules/orders/resolution-policy";
import { canRequestJntCancellation } from "@/modules/shipping/jnt-cancellation-policy";
import { CopyValue } from "./copy-value";
export function JntOrderPanel(p: {
  orderId: string;
  isOfficial: boolean;
  service: string | null;
  status: string;
  hasPaid: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  fulfillmentHeld?: boolean;
  canRead: boolean;
  requestState: string | null;
  awb: string | null;
  shipmentStatus: string | null;
  carrierCondition?: string | null;
  sellerHandoverAt?: boolean;
  errorCode?: string | null;
  externalOrderId?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    lock = useRef(false);
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState("");
  if (!p.isOfficial) return null;
  const url = `/api/v1/admin/orders/${p.orderId}/jnt`,
    issue =
      p.canCreate &&
      p.hasPaid &&
      p.status === "PACKED" &&
      (!p.requestState || p.requestState === "CANCELLED");
  const canCancel =
    p.canUpdate &&
    !!p.awb &&
    !!p.externalOrderId &&
    canRequestJntCancellation({
      orderStatus: p.status,
      requestState: p.requestState,
      shipmentStatus: p.shipmentStatus,
      carrierCondition: p.carrierCondition,
    });
  async function run(action: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "cancel"
              ? { action, reason, expectedExternalOrderId: p.externalOrderId }
              : { action },
          ),
        }),
        j = await r.json();
      if (!r.ok || !j.success || j.data.failed)
        throw new Error(
          j.error?.message ||
            "Belum berhasil. Status sebelumnya dipertahankan; periksa kembali nanti.",
        );
      setSuccess(
        action === "cancel"
          ? "Pembatalan resi dikonfirmasi J&T. Periksa status pesanan dan refund di halaman ini."
          : j.data.cancelled
            ? "J&T mengonfirmasi resi dibatalkan. Status pesanan telah disinkronkan."
            : "Status pengiriman diperbarui.",
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tindakan belum berhasil");
      router.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="jnt-flow" ref={root}>
      <strong>
        J&amp;T Express <span className="flow-status">{p.service}</span>
      </strong>
      {p.awb && (
        <p className="break-all">
          No. resi: <strong>{p.awb}</strong>
        </p>
      )}
      {p.externalOrderId && (
        <div className="flow-button-row">
          <span>
            ID order J&amp;T: <strong>{p.externalOrderId}</strong>
          </span>
          <CopyValue value={p.externalOrderId} label="Salin ID order J&T" />
        </div>
      )}
      <p className="flow-info">
        {fulfillmentLabel({
          requestState: p.requestState,
          errorCode: p.errorCode,
          sellerHandoverAt: p.sellerHandoverAt,
          shipmentStatus: p.shipmentStatus,
        })}
        {p.requestState === "SUCCEEDED" &&
        !p.sellerHandoverAt &&
        p.shipmentStatus === "PENDING"
          ? ". Paket belum dikonfirmasi diterima kurir."
          : ""}
      </p>
      {p.errorCode === "CANCELLATION_REJECTED" && (
        <p className="flow-error" role="alert">
          J&amp;T menolak pembatalan. Resi tetap aktif. Periksa kondisi paket
          melalui J&amp;T sebelum tindakan berikutnya.
        </p>
      )}
      {error && !open && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="flow-success" role="status">
          {success}
        </p>
      )}
      {issue && (
        <OperationForm
          url={url}
          label={
            p.requestState === "CANCELLED" ? "Buat resi baru" : "Buat resi"
          }
          confirmation="Periksa produk, alamat, berat dan layanan. Ajukan satu kali; jika hasil belum pasti, lakukan rekonsiliasi sebelum membuat resi lain."
          fields={[
            { name: "action", label: "Aksi", type: "hidden", value: "create" },
          ]}
        />
      )}
      {p.requestState === "UNKNOWN" && (
        <div>
          <p className="flow-warning">
            Hasil permintaan menunggu kepastian. Hubungi J&amp;T melalui kanal
            resmi. Jangan mengulangi pembuatan/pembatalan resi.
          </p>
          {p.canUpdate &&
            p.externalOrderId &&
            p.errorCode !== "CANCELLATION_PENDING" && (
              <OperationForm
                url={url}
                label="Catat resi hasil rekonsiliasi"
                confirmation="Saya memeriksa konfirmasi resmi J&T bahwa resi ini sudah dibuat untuk identitas order di bawah. Ini hanya mencatat resi yang ada, bukan mengajukan resi baru. Minimum 5 menit setelah hasil tidak pasti."
                fields={[
                  {
                    name: "action",
                    label: "Aksi",
                    type: "hidden",
                    value: "reconcile-creation",
                  },
                  {
                    name: "externalOrderId",
                    label: "Identitas order J&T",
                    value: p.externalOrderId,
                    required: true,
                    maxLength: 30,
                  },
                  {
                    name: "awb",
                    label: "Resi terkonfirmasi dari J&T",
                    required: true,
                    maxLength: 30,
                  },
                  {
                    name: "evidenceReference",
                    label: "Referensi konfirmasi resmi J&T",
                    required: true,
                    maxLength: 120,
                  },
                  {
                    name: "attested",
                    label:
                      "J&T telah mengonfirmasi resi ini milik order yang sama. Saya telah memeriksa buktinya.",
                    type: "checkbox",
                    required: true,
                  },
                ]}
              />
            )}
          {p.canUpdate && p.errorCode === "CANCELLATION_PENDING" && (
            <OperationForm
              url={url}
              label="Catat rekonsiliasi pembatalan"
              confirmation="J&T telah mengonfirmasi pembatalan melalui kanal resmi. Catat referensi bukti; minimum 5 menit setelah permintaan. Ini tidak mentransfer uang."
              fields={[
                {
                  name: "action",
                  label: "Aksi",
                  type: "hidden",
                  value: "reconcile-cancellation",
                },
                {
                  name: "expectedExternalOrderId",
                  label: "ID order J&T",
                  type: "hidden",
                  value: p.externalOrderId || "",
                },
                {
                  name: "evidenceReference",
                  label: "Referensi konfirmasi resmi J&T",
                  required: true,
                  maxLength: 120,
                },
                {
                  name: "attested",
                  label:
                    "Saya memeriksa konfirmasi resmi bahwa resi dibatalkan.",
                  type: "checkbox",
                  required: true,
                },
              ]}
            />
          )}
        </div>
      )}
      {p.canRead &&
        (p.requestState === "SUCCEEDED" ||
          (p.requestState === "UNKNOWN" &&
            p.errorCode === "CANCELLATION_PENDING")) &&
        p.awb && (
          <div className="flow-button-row">
            {p.requestState === "SUCCEEDED" && (
              <AwbPrintButton orderId={p.orderId} />
            )}
            <button
              className="flow-secondary"
              disabled={busy}
              onClick={() => run("track")}
            >
              <RefreshCw size={18} />
              {busy ? "Memeriksa…" : "Perbarui tracking"}
            </button>
          </div>
        )}
      {p.canUpdate &&
        !p.fulfillmentHeld &&
        p.hasPaid &&
        p.requestState === "SUCCEEDED" &&
        p.shipmentStatus === "PENDING" &&
        p.status === "PACKED" &&
        !p.sellerHandoverAt && (
          <OperationForm
            url={url}
            label="Catat penyerahan ke kurir"
            confirmation="Saya telah menyerahkan paket. Ini hanya mencatat pernyataan seller; status diterima kurir mengikuti tracking J&T."
            fields={[
              {
                name: "action",
                label: "Aksi",
                type: "hidden",
                value: "handover",
              },
            ]}
          />
        )}
      {canCancel && (
        <div>
          {p.sellerHandoverAt && (
            <p className="flow-warning">
              Penyerahan dicatat seller. J&amp;T akan menentukan apakah paket
              masih dapat dibatalkan. Batalkan pesanan dan tangani refund secara
              terpisah.
            </p>
          )}
          <button
            className="flow-secondary"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            Batalkan resi J&amp;T
          </button>
          <ActionDialog
            sourceRef={root}
            open={open}
            onClose={() => setOpen(false)}
            title="Batalkan resi J&T"
            description={`Resi ${p.awb} · ID J&T ${p.externalOrderId}. Ini membatalkan resi, bukan mengirim refund. Stok tidak berubah. Jika refund penuh sudah diakui pembeli dan tidak ada penerimaan kurir, pesanan akan ditutup.`}
            primary="Batalkan resi"
            busy={busy}
            error={error}
            confirmDisabled={!reason}
            onConfirm={() => void run("cancel")}
          >
            <label>
              Alasan wajib
              <select
                required
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Pilih alasan</option>
                <option>Salah data pengiriman</option>
                <option>Perubahan layanan</option>
                <option>Pesanan dibatalkan</option>
              </select>
            </label>
          </ActionDialog>
        </div>
      )}
      {p.canUpdate && p.requestState === "SUCCEEDED" && !canCancel && (
        <p className="flow-muted">
          Pembatalan resi tidak tersedia pada status ini. Jika paket sudah
          diproses kurir, lanjutkan melalui retur/refund.
        </p>
      )}
    </div>
  );
}
