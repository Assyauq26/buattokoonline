"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function CompleteOrderButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    router = useRouter();
  return (
    <section className="rounded-xl border p-4">
      <p>
        Selesaikan pesanan setelah paket diterima dan diperiksa. Kasus
        retur/refund aktif harus diselesaikan lebih dahulu.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {review && (
        <p className="py-3 font-semibold">
          Saya telah menerima dan memeriksa produk pesanan ini.
        </p>
      )}
      <Button
        disabled={busy}
        onClick={async () => {
          if (!review) {
            setReview(true);
            return;
          }
          setBusy(true);
          setError("");
          try {
            const r = await fetch(`/api/v1/orders/${orderId}/complete`, {
                method: "POST",
              }),
              j = await r.json();
            if (!r.ok || !j.success)
              throw new Error(j.error?.message || "Belum berhasil");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Coba lagi");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Menyimpan…"
          : review
            ? "Konfirmasi pesanan selesai"
            : "Pesanan sudah diterima"}
      </Button>
    </section>
  );
}
