"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Printer, RefreshCw } from "lucide-react";
import { OperationForm } from "./operation-form";
import { fulfillmentLabel } from "@/modules/orders/resolution-policy";
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
  sellerHandoverAt?: boolean;
  errorCode?: string | null;
  externalOrderId?: string;
}) {
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
  async function run(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "cancel" ? { action, reason } : { action },
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
          ? "Resi dibatalkan. Pesanan dan pembayaran tetap aktif."
          : "Status pengiriman diperbarui.",
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tindakan belum berhasil");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="jnt-flow">
      <strong>
        J&amp;T Express <span className="flow-status">{p.service}</span>
      </strong>
      {p.awb && (
        <p className="break-all">
          No. resi: <strong>{p.awb}</strong>
        </p>
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
      {error && (
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
      {p.canRead && p.requestState === "SUCCEEDED" && p.awb && (
        <div className="flow-button-row">
          <a
            className="flow-secondary"
            href={`/admin/orders/${p.orderId}/awb`}
            target="_blank"
            rel="noreferrer"
          >
            <Printer size={18} /> Cetak AWB
          </a>
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
      {p.canUpdate &&
        p.requestState === "SUCCEEDED" &&
        p.shipmentStatus === "PENDING" &&
        p.status === "PACKED" &&
        !p.sellerHandoverAt && (
          <details>
            <summary>Tindakan lainnya</summary>
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <button className="flow-secondary">
                  Batalkan resi J&amp;T
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
                  className="order-filter-sheet order-workflow"
                  aria-describedby="cancel-awb-desc"
                >
                  <header>
                    <Dialog.Title>Batalkan resi J&amp;T</Dialog.Title>
                    <Dialog.Close asChild>
                      <button aria-label="Tutup">
                        <X />
                      </button>
                    </Dialog.Close>
                  </header>
                  <p>
                    Resi <strong>{p.awb}</strong>
                  </p>
                  <p id="cancel-awb-desc" className="flow-info">
                    Pesanan dan pembayaran tetap aktif. Stok tidak berubah.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run("cancel");
                    }}
                  >
                    <label>
                      Alasan wajib
                      <select
                        required
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      >
                        <option value="">Pilih alasan</option>
                        <option>Salah data pengiriman</option>
                        <option>Perubahan layanan</option>
                        <option>Pesanan dibatalkan</option>
                      </select>
                    </label>
                    {error && (
                      <p className="flow-error" role="alert">
                        {error}
                      </p>
                    )}
                    <footer>
                      <Dialog.Close asChild>
                        <button type="button">Kembali</button>
                      </Dialog.Close>
                      <button disabled={busy} className="flow-danger">
                        {busy ? "Memproses…" : "Batalkan resi"}
                      </button>
                    </footer>
                  </form>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </details>
        )}
    </div>
  );
}
