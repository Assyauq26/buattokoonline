"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionDialog } from "@/components/ui/action-dialog";
type Review = {
  orderNumber: string;
  shippingService: string | null;
  shippingWeightGram: number | null;
  address: {
    recipientName: string;
    phone: string;
    line: string;
    village: string | null;
    district: string;
    city: string;
    province: string;
  } | null;
  items: {
    id: string;
    productName: string;
    variantLabel: string;
    quantity: number;
  }[];
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
    [error, setError] = useState("");
  async function show() {
    const current = ++generation.current;
    setOpen(true);
    setLoading(true);
    setReview(null);
    setError("");
    try {
      const r = await fetch(`/api/v1/admin/orders/${orderId}/shipping-review`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j.success)
        throw Error(j.error?.message || "Rincian pengiriman belum tersedia");
      if (current === generation.current) setReview(j.data);
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Gagal memuat pengiriman");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  return (
    <div ref={root}>
      <button className="flow-primary" onClick={() => void show()}>
        {label}
      </button>
      <ActionDialog
        sourceRef={root}
        open={open}
        title="Review pengiriman"
        description="Periksa penerima, layanan, berat dan barang. Pembuatan resi tidak otomatis memesan pickup."
        primary="Buat resi"
        confirmDisabled={loading || !review || !!error}
        busy={busy}
        error={error}
        onClose={() => {
          generation.current++;
          setOpen(false);
        }}
        onConfirm={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            const r = await fetch(`/api/v1/admin/orders/${orderId}/jnt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "create" }),
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
        }}
      >
        {loading && <p role="status">Memuat rincian…</p>}
        {review && (
          <div className="awb-review">
            <strong>{review.orderNumber}</strong>
            <p>
              {review.address?.recipientName} · {review.address?.phone}
            </p>
            <p>
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
            <p>
              J&amp;T Express · {review.shippingService} ·{" "}
              {review.shippingWeightGram} gram
            </p>
            <ul>
              {review.items.map((i) => (
                <li key={i.id}>
                  {i.productName} · {i.variantLabel} × {i.quantity}
                </li>
              ))}
            </ul>
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
