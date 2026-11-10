"use client";
import { ConfirmActions } from "@/components/ui/action-dialog";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  Upload,
  Building,
  Info,
  Package,
} from "lucide-react";
import type { resolutionView } from "@/modules/orders/resolution.service";
import { formatIDR } from "@/lib/money";
type View = Awaited<ReturnType<typeof resolutionView>>;
const labels: Record<string, string> = {
  REVIEW: "Perlu ditinjau",
  WAITING_PAYMENT: "Periksa dana masuk",
  WAITING_SHIPMENT: "Menunggu pembatalan resi",
  WAITING_RETURN: "Menunggu pemeriksaan retur",
  WAITING_BANK: "Menunggu rekening pembeli",
  READY: "Refund siap diproses",
  TRANSFER_PENDING: "Rekening dikunci · menunggu catatan transfer",
  TRANSFER_RECORDED: "Dana dikembalikan · dicatat seller",
  DISPUTED: "Refund perlu tindak lanjut",
  RECEIVED: "Dana diterima pembeli",
  REJECTED: "Permintaan ditolak",
  CANCELLED_NO_REFUND: "Pesanan dibatalkan",
};
export const resolutionLabel = (s: string) => labels[s] || "Perlu ditinjau";
export function ResolutionFlow({
  view,
  caseId,
  staff,
  mode = "RETURN",
  permissions = [],
  style,
}: {
  view: View;
  caseId?: string;
  staff: boolean;
  mode?: "CANCEL" | "RETURN";
  permissions?: string[];
  style?: CSSProperties;
}) {
  const canVerify = staff && permissions.includes("payment.verify"),
    canCancel = staff && permissions.includes("order.cancel"),
    canInspect = staff && permissions.includes("inventory.adjust");
  const router = useRouter(),
    c = view.cases.find((c) => c.id === caseId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ok, setOk] = useState(""),
    [reason, setReason] = useState(""),
    [requestId] = useState(() => crypto.randomUUID());
  const root = staff ? "/admin/orders" : "/orders",
    back = `${root}/${view.orderId}`;
  async function send(data: unknown, isRequest = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await fetch("/api/v1/order-resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isRequest ? view.orderId : c!.id,
          operation: isRequest ? "request" : "command",
          data,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success)
        throw new Error(j.error?.message || "Tindakan belum tersimpan");
      setOk("Perubahan tersimpan.");
      if (isRequest) router.replace(`${back}/resolution?case=${j.data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(form: HTMLFormElement, kind: "transfer" | "evidence") {
    if (busy) return;
    setBusy(true);
    setError("");
    setOk("");
    try {
      const data = new FormData(form);
      data.set("id", c!.id);
      data.set("kind", kind);
      if (kind === "transfer") {
        data.set("revision", String(c!.revision));
        data.set(
          "settledAt",
          new Date(String(data.get("settledAt"))).toISOString(),
        );
      }
      const r = await fetch("/api/v1/order-resolutions", {
        method: "POST",
        body: data,
      });
      const j = await r.json();
      if (!r.ok || !j.success)
        throw new Error(j.error?.message || "Unggahan gagal");
      setOk("Bukti tersimpan.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unggahan gagal");
    } finally {
      setBusy(false);
    }
  }
  const command = (action: string, fields: Record<string, unknown> = {}) =>
    send({ action, revision: c!.revision, ...fields });
  const formValues = (form: HTMLFormElement) =>
    Object.fromEntries(new FormData(form));
  return (
    <div className="order-workflow resolution-flow" style={style}>
      <ConfirmActions busy={busy} error={error}>
        <Link href={back} className="flow-back">
          <ArrowLeft size={20} /> Detail pesanan
        </Link>
        <header>
          <h1>
            {c && c.refundAmount > 0
              ? "Proses refund"
              : c?.kind === "CANCEL" || mode === "CANCEL"
                ? "Batalkan pesanan"
                : "Retur & refund"}
          </h1>
          <strong>{view.orderNumber}</strong>
          {c && <span className="flow-status">{labels[c.state]}</span>}
        </header>
        <p className="flow-error" role="alert">
          {error}
        </p>
        <p role="status" className="flow-success">
          {ok}
        </p>
        {!c ? (
          staff && !(mode === "CANCEL" ? canCancel : canVerify) ? (
            <section className="order-panel">
              Izin pengelolaan kasus diperlukan. Kembali ke detail pesanan untuk
              melihat status.
            </section>
          ) : mode === "RETURN" && !view.leftWarehouse ? (
            <section className="order-panel">
              Paket belum diserahkan. Hubungi toko untuk pembatalan pesanan;
              retur / refund digunakan setelah paket keluar gudang.
            </section>
          ) : (
            <section className="order-panel">
              <h2>
                {mode === "CANCEL"
                  ? "Alasan pembatalan"
                  : "Ajukan retur / refund"}
              </h2>
              <form
                method="post"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ requestId, kind: mode, reason }, true);
                }}
              >
                <label>
                  Alasan
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    minLength={3}
                    maxLength={1500}
                    placeholder="Jelaskan alasan dan kondisi pesanan"
                  />
                </label>
                <button disabled={busy} className="flow-primary">
                  {busy ? "Menyimpan…" : "Lanjutkan"}
                </button>
              </form>
            </section>
          )
        ) : (
          <>
            <ol className="flow-steps" aria-label="Tahapan kasus">
              {(c.kind === "CANCEL"
                ? ["Alasan", "Ringkasan", "Konfirmasi"]
                : ["Pengajuan", "Peninjauan", "Pengembalian"]
              ).map((s, i) => (
                <li
                  key={s}
                  data-active={
                    i === 0 ||
                    (i === 1 && c.state !== "REVIEW") ||
                    (i === 2 &&
                      ["TRANSFER_RECORDED", "RECEIVED"].includes(c.state))
                  }
                >
                  <span>{i === 0 ? <Check size={16} /> : i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <div className="flow-columns">
              <div>
                <section className="order-panel">
                  <h2>
                    Ringkasan{" "}
                    {c.kind === "CANCEL" ? "pembatalan" : "retur / refund"}
                  </h2>
                  <p>{c.reason}</p>
                  <ul className="flow-item-breakdown">
                    {view.items.map((item) => (
                      <li key={item.id}>
                        <strong>
                          {item.productName} × {item.quantity}
                        </strong>
                        <span>
                          {formatIDR(item.net)} setelah diskon{" "}
                          {formatIDR(item.lineTotal - item.net)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <dl className="flow-totals">
                    <div>
                      <dt>Produk (snapshot)</dt>
                      <dd>{formatIDR(view.total - view.shippingCost)}</dd>
                    </div>
                    <div>
                      <dt>Diskon teralokasi dalam harga</dt>
                      <dd>{formatIDR(view.discount)}</dd>
                    </div>
                    <div>
                      <dt>Ongkir dibayar</dt>
                      <dd>{formatIDR(view.shippingCost)}</dd>
                    </div>
                    <div>
                      <dt>Refund lain disetujui / dicatat</dt>
                      <dd>{formatIDR(view.previous - c.refundAmount)}</dd>
                    </div>
                    <div>
                      <dt>Sisa dana di luar kasus ini</dt>
                      <dd>{formatIDR(view.remaining)}</dd>
                    </div>
                    <div>
                      <dt>Nominal kasus ini</dt>
                      <dd>
                        {formatIDR(
                          c.refundAmount ||
                            (c.kind === "CANCEL" && view.paid
                              ? view.remaining
                              : 0),
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p className="flow-info">
                    <Info size={18} />{" "}
                    {view.leftWarehouse
                      ? "Paket sudah keluar gudang. Retur memerlukan pemeriksaan barang."
                      : view.shipmentActive
                        ? "Resi aktif / belum pasti. Pembatalan transaksi menunggu penyelesaian resi."
                        : "Tidak ada resi aktif. Pembatalan sebelum pengiriman mengembalikan reservasi / stok tepat sekali."}
                  </p>
                  {c.policyReason && (
                    <p>Kebijakan / keputusan: {c.policyReason}</p>
                  )}
                </section>
                {canCancel &&
                  (!view.paid || canVerify) &&
                  c.kind === "CANCEL" &&
                  ["REVIEW", "WAITING_PAYMENT", "WAITING_SHIPMENT"].includes(
                    c.state,
                  ) && (
                    <section className="order-panel">
                      <h2>Konfirmasi dampak</h2>
                      <p>
                        {view.paid
                          ? `Dana diterima ${formatIDR(view.total)}. Default refund penuh termasuk ongkir setelah pesanan dibatalkan.`
                          : "Periksa bukti dan mutasi rekening sebelum menyatakan tidak ada dana diterima."}
                      </p>
                      <p className="flow-info">
                        Pembeli menerima pemberitahuan. Pembatalan tidak
                        otomatis mentransfer uang.
                      </p>
                      {c.state === "WAITING_SHIPMENT" && (
                        <Link
                          className="flow-secondary"
                          href={back + "#order-shipping"}
                        >
                          Selesaikan pembatalan resi
                        </Link>
                      )}
                      {c.state === "WAITING_PAYMENT" && (
                        <Link
                          className="flow-secondary"
                          href={back + "/payment"}
                        >
                          Periksa pembayaran
                        </Link>
                      )}
                      <form
                        data-confirm-title="Batalkan pesanan?"
                        data-confirm-label="Batalkan dan lanjutkan"
                        data-confirm-description={
                          view.paid
                            ? `Dana diterima ${formatIDR(view.total)}. Pembatalan membuat kewajiban refund sesuai ringkasan, tanpa transfer otomatis.`
                            : "Pembatalan mengikuti hasil pemeriksaan dana dan resi. Reservasi dikembalikan tepat sekali."
                        }
                        method="post"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = formValues(e.currentTarget);
                          command("confirm-cancel", {
                            fundsReview: f.noFunds
                              ? "NOT_RECEIVED"
                              : "UNREVIEWED",
                            attested: !!f.noFunds,
                          });
                        }}
                      >
                        {!view.paid && (
                          <label className="flow-check">
                            <input type="checkbox" name="noFunds" />
                            Saya memeriksa mutasi dan memastikan dana belum
                            diterima. Bukti yang meragukan tetap perlu
                            pemeriksaan.
                          </label>
                        )}

                        <button className="flow-danger" disabled={busy}>
                          {busy
                            ? "Memproses…"
                            : view.shipmentActive
                              ? "Catat pembatalan tertunda"
                              : view.paid
                                ? "Batalkan dan lanjut ke refund"
                                : "Konfirmasi pembatalan"}
                        </button>
                      </form>
                    </section>
                  )}
                {canVerify && c.kind === "RETURN" && c.state === "REVIEW" && (
                  <section className="order-panel">
                    <h2>Keputusan retur / refund</h2>
                    <form
                      method="post"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = formValues(e.currentTarget),
                          items = view.items
                            .map((i) => ({
                              orderItemId: i.id,
                              quantity: Number(f[i.id] || 0),
                            }))
                            .filter((i) => i.quantity > 0);
                        if (!items.length) {
                          setError(
                            "Pilih minimal satu produk dengan jumlah lebih dari nol.",
                          );
                          return;
                        }
                        command("approve-return", {
                          items,
                          shippingAmount: Number(f.shippingAmount),
                          returnRequired: !!f.returnRequired,
                          policyReason: f.policyReason,
                        });
                      }}
                    >
                      {view.items.map((i) => (
                        <label key={i.id}>
                          {i.productName} · maks. {i.quantity}
                          <input
                            type="number"
                            name={i.id}
                            min={0}
                            max={i.quantity}
                            defaultValue={0}
                          />
                        </label>
                      ))}
                      <label>
                        Ongkir dikembalikan (Rp)
                        <input
                          type="number"
                          name="shippingAmount"
                          min={0}
                          max={view.shippingCost}
                          defaultValue={0}
                          required
                        />
                      </label>
                      <label>
                        Dasar kebijakan dan rincian biaya
                        <textarea
                          name="policyReason"
                          minLength={3}
                          maxLength={1500}
                          required
                        />
                      </label>
                      <label className="flow-check">
                        <input
                          type="checkbox"
                          name="returnRequired"
                          defaultChecked
                        />
                        Barang harus dikembalikan dan diperiksa sebelum refund.
                      </label>
                      <p className="flow-info">
                        Nominal produk dihitung server dari snapshot setelah
                        diskon dan kuantitas yang belum direfund. Biaya J&T
                        tidak otomatis kembali.
                      </p>
                      <button className="flow-primary" disabled={busy}>
                        Setujui rincian refund
                      </button>
                    </form>
                  </section>
                )}
                {canVerify &&
                  ["REVIEW", "WAITING_PAYMENT", "WAITING_SHIPMENT"].includes(
                    c.state,
                  ) && (
                    <details className="order-panel">
                      <summary>Tolak permintaan</summary>
                      <form
                        method="post"
                        onSubmit={(e) => {
                          e.preventDefault();
                          command("reject", {
                            reason: formValues(e.currentTarget).reason,
                          });
                        }}
                      >
                        <label>
                          Alasan yang dapat dibaca pembeli
                          <textarea
                            name="reason"
                            minLength={3}
                            maxLength={1500}
                            required
                          />
                        </label>
                        <button className="flow-secondary" disabled={busy}>
                          Simpan penolakan
                        </button>
                      </form>
                    </details>
                  )}
                {c.state === "WAITING_RETURN" && (
                  <section className="order-panel">
                    <h2>
                      <Package size={20} /> Pengembalian barang
                    </h2>
                    {staff && !canInspect && (
                      <p className="flow-muted">
                        Pemeriksaan dan perubahan stok memerlukan izin gudang.
                      </p>
                    )}
                    <p>
                      {c.returnTracking
                        ? `Resi retur: ${c.returnTracking}`
                        : "Belum ada resi retur."}
                    </p>
                    {staff ? (
                      <form
                        method="post"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = formValues(e.currentTarget);
                          if (!canInspect) return;
                          command("inspect-return", {
                            attested: true,
                            restock: !!f.restock,
                            note: f.note,
                          });
                        }}
                      >
                        <label>
                          Hasil pemeriksaan
                          <textarea
                            name="note"
                            minLength={3}
                            maxLength={1500}
                            required
                          />
                        </label>
                        <label className="flow-check">
                          <input type="checkbox" required />
                          Barang sudah diterima dan diperiksa fisik.
                        </label>
                        <label className="flow-check">
                          <input type="checkbox" name="restock" />
                          Barang layak jual dan boleh ditambahkan ke stok.
                        </label>
                        <button
                          className="flow-primary"
                          disabled={busy || !canInspect}
                        >
                          Catat hasil pemeriksaan
                        </button>
                      </form>
                    ) : (
                      <form
                        method="post"
                        onSubmit={(e) => {
                          e.preventDefault();
                          command("return-shipped", {
                            tracking: formValues(e.currentTarget).tracking,
                          });
                        }}
                      >
                        <label>
                          Resi pengembalian
                          <input
                            name="tracking"
                            minLength={5}
                            maxLength={100}
                            defaultValue={c.returnTracking || ""}
                            required
                          />
                        </label>
                        <button className="flow-primary" disabled={busy}>
                          Simpan resi retur
                        </button>
                      </form>
                    )}
                  </section>
                )}
                {c.refundAmount > 0 && (
                  <section className="order-panel">
                    <h2>
                      <Building size={20} /> Rekening tujuan pengembalian
                    </h2>
                    {c.bank ? (
                      <p>
                        {c.bank.bank} · {c.bank.holder}
                        <br />
                        {c.bank.number}
                      </p>
                    ) : (
                      <p>
                        {c.hasBank
                          ? "Rekening tersimpan. Izin keuangan diperlukan untuk melihat detail."
                          : "Pembeli perlu mengisi rekening melalui akun pemilik pesanan."}
                      </p>
                    )}
                    {!staff &&
                      ["WAITING_BANK", "READY", "WAITING_RETURN"].includes(
                        c.state,
                      ) && (
                        <form
                          method="post"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = formValues(e.currentTarget);
                            command("bank", {
                              bank: {
                                bank: f.bank,
                                holder: f.holder,
                                number: f.number,
                              },
                            });
                          }}
                        >
                          <label>
                            Nama bank
                            <input
                              name="bank"
                              required
                              minLength={2}
                              maxLength={80}
                              defaultValue={c.bank?.bank}
                            />
                          </label>
                          <label>
                            Nama pemilik rekening
                            <input
                              name="holder"
                              required
                              minLength={2}
                              maxLength={120}
                              defaultValue={c.bank?.holder}
                            />
                          </label>
                          <label>
                            Nomor rekening
                            <input
                              name="number"
                              inputMode="numeric"
                              pattern="[0-9]{5,30}"
                              required
                              defaultValue={c.bank?.number}
                            />
                          </label>
                          <button disabled={busy} className="flow-primary">
                            Simpan rekening tujuan
                          </button>
                        </form>
                      )}
                  </section>
                )}
                {canVerify && c.state === "READY" && (
                  <section className="order-panel">
                    <h2>Tinjau rekening &amp; nominal</h2>
                    <p>
                      {formatIDR(c.refundAmount)} ke rekening pembeli di atas.
                    </p>
                    <p className="flow-warning">
                      Periksa rekening sebelum transfer. Langkah ini mengunci
                      rekening dan nominal; belum mencatat dana dikembalikan.
                    </p>
                    <button
                      disabled={busy}
                      className="flow-primary"
                      data-confirm-title="Kunci rekening dan nominal refund?"
                      data-confirm-label="Lanjutkan transfer manual"
                      onClick={() =>
                        command("prepare-transfer", { attested: true })
                      }
                    >
                      Rekening dan nominal sudah benar
                    </button>
                  </section>
                )}
                {canVerify && c.state === "TRANSFER_PENDING" && (
                  <section className="order-panel">
                    <h2>Catat transfer refund</h2>
                    <p className="flow-info">
                      Transfer dana terlebih dahulu ke rekening pembeli di atas.
                      Mencatat refund tidak melakukan transfer otomatis.
                    </p>
                    <form
                      data-confirm-title="Catat pengembalian dana?"
                      data-confirm-label="Konfirmasi dana dikembalikan"
                      data-confirm-description="Pastikan transfer telah dilakukan ke rekening pembeli. Ini mencatat klaim seller dengan bukti, bukan verifikasi otomatis bank."
                      method="post"
                      onSubmit={(e) => {
                        e.preventDefault();
                        upload(e.currentTarget, "transfer");
                      }}
                    >
                      <label>
                        Nominal sesuai kewajiban (Rp)
                        <input
                          type="number"
                          name="amount"
                          value={c.refundAmount}
                          readOnly
                        />
                      </label>
                      <label>
                        Bukti transfer · JPG, PNG, WebP, PDF · maks. 4 MB
                        <input
                          type="file"
                          name="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          required
                        />
                      </label>
                      <label>
                        Referensi transaksi
                        <input
                          name="reference"
                          minLength={5}
                          maxLength={160}
                          required
                        />
                      </label>
                      <label>
                        Waktu dana ditransfer
                        <input
                          type="datetime-local"
                          name="settledAt"
                          required
                        />
                      </label>
                      <label className="flow-check">
                        <input
                          name="attested"
                          value="true"
                          type="checkbox"
                          required
                        />
                        Dana sudah ditransfer ke rekening tujuan di atas. Bukti
                        dan nominal sudah diperiksa.
                      </label>
                      <button className="flow-primary" disabled={busy}>
                        {busy ? "Menyimpan…" : "Konfirmasi dana dikembalikan"}
                      </button>
                    </form>
                  </section>
                )}
                {canVerify && c.state === "TRANSFER_PENDING" && (
                  <details className="order-panel">
                    <summary>Hasil transfer belum pasti?</summary>
                    <p className="flow-warning">
                      Periksa referensi transfer pertama melalui bank. Jangan
                      transfer ulang selama hasilnya belum jelas. Rekening
                      tujuan tetap dikunci.
                    </p>
                    <form
                      method="post"
                      onSubmit={(e) => {
                        e.preventDefault();
                        command("follow-up", {
                          note: formValues(e.currentTarget).note,
                        });
                      }}
                    >
                      <label>
                        Catatan pemeriksaan / tindak lanjut
                        <textarea
                          name="note"
                          minLength={3}
                          maxLength={1500}
                          required
                        />
                      </label>
                      <button disabled={busy} className="flow-secondary">
                        Simpan tindak lanjut
                      </button>
                    </form>
                  </details>
                )}
                {c.transfer && (
                  <section className="order-panel">
                    <h2>Transfer dicatat seller</h2>
                    <p>
                      {formatIDR(c.transfer.amount)} · {c.transfer.reference}
                    </p>
                    <p>
                      {new Date(c.transfer.settledAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
                    </p>
                    <a
                      className="flow-secondary"
                      target="_blank"
                      rel="noreferrer"
                      href={`/api/v1/order-resolutions/proof?kind=transfer&id=${c.transfer.id}`}
                    >
                      Lihat bukti transfer
                    </a>
                    <p className="flow-info">
                      Bukti unggah bukan verifikasi bank otomatis.
                    </p>
                    {!staff &&
                      ["TRANSFER_RECORDED", "DISPUTED"].includes(c.state) && (
                        <>
                          <button
                            disabled={busy}
                            className="flow-primary"
                            onClick={() =>
                              command("received", { attested: true })
                            }
                          >
                            Saya telah menerima dana
                          </button>
                          <form
                            method="post"
                            onSubmit={(e) => {
                              e.preventDefault();
                              command("dispute", {
                                reason: formValues(e.currentTarget).reason,
                              });
                            }}
                          >
                            <label>
                              Dana belum diterima / kendala
                              <textarea
                                name="reason"
                                required
                                minLength={3}
                                maxLength={1500}
                              />
                            </label>
                            <button className="flow-secondary" disabled={busy}>
                              Laporkan kendala refund
                            </button>
                          </form>
                        </>
                      )}
                    {canVerify &&
                      ["TRANSFER_RECORDED", "DISPUTED"].includes(c.state) && (
                        <form
                          method="post"
                          onSubmit={(e) => {
                            e.preventDefault();
                            command("follow-up", {
                              note: formValues(e.currentTarget).note,
                            });
                          }}
                        >
                          <label>
                            Tindak lanjut ke pembeli
                            <textarea
                              name="note"
                              required
                              minLength={3}
                              maxLength={1500}
                            />
                          </label>
                          <p className="flow-info">
                            Periksa transfer pertama sebelum tindakan lain.
                            Transfer kedua tidak dapat dicatat untuk kasus yang
                            sama.
                          </p>
                          <button disabled={busy} className="flow-secondary">
                            Simpan tindak lanjut
                          </button>
                        </form>
                      )}
                  </section>
                )}
              </div>
              <aside>
                <section className="order-panel">
                  <h2>
                    <Clock size={20} /> Riwayat kasus
                  </h2>
                  <ol className="flow-history">
                    {c.events.map((e) => (
                      <li key={e.id}>
                        <p>{e.note}</p>
                        <time>
                          {new Date(e.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
                        </time>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="order-panel">
                  <h2>Bukti pendukung</h2>
                  {c.evidence.map((e, i) => (
                    <a
                      key={e.id}
                      className="flow-secondary"
                      target="_blank"
                      rel="noreferrer"
                      href={`/api/v1/order-resolutions/proof?kind=evidence&id=${e.id}`}
                    >
                      Bukti {i + 1}
                    </a>
                  ))}
                  {!["RECEIVED", "REJECTED", "CANCELLED_NO_REFUND"].includes(
                    c.state,
                  ) && (
                    <form
                      method="post"
                      onSubmit={(e) => {
                        e.preventDefault();
                        upload(e.currentTarget, "evidence");
                      }}
                    >
                      <label>
                        Foto / dokumen · maks. 4 MB
                        <input
                          type="file"
                          name="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          required
                        />
                      </label>
                      <button disabled={busy} className="flow-secondary">
                        <Upload size={18} /> Unggah bukti
                      </button>
                    </form>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </ConfirmActions>
    </div>
  );
}
