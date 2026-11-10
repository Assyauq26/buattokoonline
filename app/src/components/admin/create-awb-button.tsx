"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Truck, Package, ChevronDown } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
type Address = {
  recipientName: string;
  phone: string;
  line: string;
  village: string | null;
  district: string;
  city: string;
  province: string;
};
type Review = {
  fingerprint: string;
  shippingService: string | null;
  shippingWeightGram: number | null;
  address: Address | null;
  items: {
    id: string;
    variant: { productId: string } | null;
    productName: string;
    variantLabel: string;
    quantity: number;
  }[];
};
type Draft = {
  recipientName: string;
  phone: string;
  line: string;
  village: string;
  weightGram: string;
};
export function CreateAwbButton({
  orderId,
  label = "Buat resi",
}: {
  orderId: string;
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    lock = useRef(false),
    generation = useRef(0),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [quote, setQuote] = useState<{ rate: number; charged: number } | null>(
      null,
    ),
    [accepted, setAccepted] = useState(false),
    [draft, setDraft] = useState<Draft>({
      recipientName: "",
      phone: "",
      line: "",
      village: "",
      weightGram: "",
    });
  const endpoint = `/api/v1/admin/orders/${orderId}/shipping-review`;
  async function read() {
    const r = await fetch(endpoint, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.success)
      throw Error(j.error?.message || "Rincian belum tersedia");
    return j.data as Review;
  }
  function populate(v: Review) {
    setReview(v);
    setDraft({
      recipientName: v.address?.recipientName || "",
      phone: v.address?.phone || "",
      line: v.address?.line || "",
      village: v.address?.village || "",
      weightGram: String(v.shippingWeightGram || ""),
    });
    setQuote(null);
    setAccepted(false);
  }
  async function show() {
    if (lock.current) return;
    const current = ++generation.current;
    setOpen(true);
    setLoading(true);
    setReview(null);
    setError("");
    setEditing(false);
    try {
      const v = await read();
      if (current === generation.current) populate(v);
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Gagal memuat pengiriman");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  const dirty =
    !!review &&
    (draft.weightGram !== String(review.shippingWeightGram || "") ||
      ["recipientName", "phone", "line", "village"].some(
        (k) =>
          draft[k as keyof Draft] !==
          (review.address?.[k as keyof Address] || ""),
      ));
  const valid =
    Number.isInteger(Number(draft.weightGram)) &&
    Number(draft.weightGram) > 0 &&
    Number(draft.weightGram) <= 100000 &&
    draft.recipientName.trim().length > 0 &&
    draft.recipientName.trim().length <= 30 &&
    /^(?:\+62|62|0)\d{8,12}$/.test(draft.phone) &&
    draft.line.trim().length >= 5;
  function update(k: keyof Draft, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
    setQuote(null);
    setAccepted(false);
    setError("");
  }
  async function submit() {
    if (lock.current || !review || !valid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (dirty) {
        const save = !!quote;
        const r = await fetch(endpoint, {
          method: save ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            weightGram: Number(draft.weightGram),
            fingerprint: review.fingerprint,
            ...(save ? { approvedRate: quote.rate } : {}),
          }),
        });
        const j = await r.json();
        if (!r.ok || !j.success)
          throw Error(j.error?.message || "Perubahan belum tersimpan");
        if (save) {
          populate(await read());
          setEditing(false);
          router.refresh();
        } else setQuote(j.data);
        return;
      }
      const r = await fetch(`/api/v1/admin/orders/${orderId}/jnt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          reviewFingerprint: review.fingerprint,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success)
        throw Error(j.error?.message || "Pembuatan resi gagal");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Hasil belum pasti. Periksa status terbaru sebelum mengulang.",
      );
      router.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const products = review
    ? new Set(review.items.map((i) => i.variant?.productId || i.id)).size
    : 0;
  const primary = dirty
    ? quote
      ? "Simpan perubahan"
      : "Periksa tarif"
    : editing
      ? "Selesai mengubah"
      : "Buat resi";
  return (
    <div ref={root}>
      <button className="flow-primary" onClick={() => void show()}>
        {label}
      </button>
      <ActionDialog
        sourceRef={root}
        open={open}
        variant="shipping"
        title="Buat resi pengiriman"
        description="Pastikan data berikut sudah sesuai."
        primary={primary}
        busyLabel={dirty ? "Memeriksa…" : "Membuat resi…"}
        confirmDisabled={
          loading ||
          !review ||
          !valid ||
          !!(dirty && quote && quote.rate !== quote.charged && !accepted)
        }
        busy={busy}
        error={error}
        onClose={() => {
          generation.current++;
          setOpen(false);
        }}
        onConfirm={() =>
          editing && !dirty ? setEditing(false) : void submit()
        }
      >
        {loading && <p role="status">Memuat rincian…</p>}
        {review && (
          <div className="shipping-review-content">
            <section className="shipping-review-section">
              <MapPin aria-hidden="true" size={26} />
              <div className="shipping-review-recipient">
                <div className="shipping-review-heading">
                  <strong>{review.address?.recipientName}</strong>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(!editing);
                      setError("");
                    }}
                  >
                    Ubah
                  </button>
                </div>
                {!editing ? (
                  <>
                    <p>{review.address?.phone}</p>
                    <p className="shipping-review-address">
                      {[
                        review.address?.line,
                        review.address?.village,
                        review.address?.district,
                        review.address?.city,
                        review.address?.province,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </>
                ) : (
                  <fieldset disabled={busy} className="shipping-review-editor">
                    {(
                      [
                        ["recipientName", "Nama penerima", 30],
                        ["phone", "Nomor telepon", 15],
                        ["village", "Desa / kelurahan", 60],
                        ["line", "Alamat lengkap", 150],
                      ] as const
                    ).map(([key, title, max]) => (
                      <label key={key}>
                        {title}
                        <input
                          value={draft[key]}
                          maxLength={max}
                          onChange={(e) => update(key, e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    ))}
                    <p>
                      Wilayah tujuan tetap:{" "}
                      {[
                        review.address?.district,
                        review.address?.city,
                        review.address?.province,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      . Perubahan hanya untuk pesanan ini.
                    </p>
                  </fieldset>
                )}
              </div>
            </section>
            <section className="shipping-review-section">
              <Truck aria-hidden="true" size={26} />
              <div className="shipping-review-recipient">
                <strong>J&amp;T Express • {review.shippingService}</strong>
                <label className="shipping-review-weight">
                  Berat paket
                  <span>
                    <input
                      aria-label="Berat paket dalam gram"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100000}
                      step={1}
                      value={draft.weightGram}
                      disabled={busy}
                      onChange={(e) => update("weightGram", e.target.value)}
                    />
                    <span>gram</span>
                  </span>
                </label>
                {!valid && (
                  <p role="status">
                    Lengkapi penerima dan berat 1–100.000 gram.
                  </p>
                )}
              </div>
            </section>
            <details className="shipping-review-products">
              <summary>
                <Package aria-hidden="true" size={26} />
                <span>
                  <strong>
                    {products} produk •{" "}
                    {review.items.reduce((n, i) => n + i.quantity, 0)} pcs
                  </strong>
                  <small>Lihat rincian barang</small>
                </span>
                <ChevronDown aria-hidden="true" size={22} />
              </summary>
              <ul>
                {review.items.map((i) => (
                  <li key={i.id}>
                    <strong>{i.productName}</strong>
                    <span>
                      {i.variantLabel || "Tanpa variasi"} · {i.quantity} pcs
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            {quote && (
              <div className="shipping-review-quote" role="status">
                <p>
                  Tarif J&amp;T: Rp{quote.rate.toLocaleString("id-ID")}. Ongkir
                  transaksi tetap Rp{quote.charged.toLocaleString("id-ID")}.
                </p>
                {quote.rate !== quote.charged && (
                  <label>
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />{" "}
                    Saya menyetujui selisih tarif menjadi tanggungan toko.
                    Tagihan pembeli tetap.
                  </label>
                )}
              </div>
            )}
          </div>
        )}
        {error && !review && (
          <button className="flow-secondary" onClick={() => void show()}>
            Coba lagi
          </button>
        )}
      </ActionDialog>
    </div>
  );
}
