"use client";
import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import type { AwbSize } from "@/modules/shipping/awb-pdf";
export function AwbPrintButton({ orderId }: { orderId?: string }) {
  const root = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false),
    [size, setSize] = useState<AwbSize>("100x150"),
    [pdf, setPdf] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const url = `/api/v1/admin/orders/${encodeURIComponent(orderId || "")}/awb?size=${size}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem("awb-print-size");
      if (v === "100x150" || v === "75x150") setSize(v);
    } catch {}
  }, []);
  useEffect(() => {
    if (!open || !orderId) return;
    const controller = new AbortController();
    let objectUrl = "",
      active = true;
    setLoading(true);
    setError("");
    setPdf("");
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (
          !r.ok ||
          !r.headers.get("content-type")?.includes("application/pdf")
        )
          throw Error(
            "Preview belum tersedia. Periksa resi aktif dan rincian alamat, lalu coba lagi.",
          );
        const blob = await r.blob();
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setPdf(objectUrl);
        }
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, orderId, url]);
  return (
    <div ref={root}>
      <button
        type="button"
        className="flow-secondary"
        onClick={() => (orderId ? setOpen(true) : window.print())}
      >
        <Printer size={18} />
        Cetak AWB
      </button>
      <ActionDialog
        sourceRef={root}
        open={open}
        onClose={() => setOpen(false)}
        title="Cetak AWB"
        description="Pilih ukuran kertas. Cetak ulang memakai resi yang sama; menutup dialog cetak tidak menandai paket sudah dicetak."
        primary="Cetak"
        confirmDisabled={loading || !!error || !pdf}
        error={error}
        onConfirm={() => {
          if (pdf && !loading && !error) {
            try {
              localStorage.setItem("awb-print-size", size);
            } catch {}
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }}
      >
        <label>
          Ukuran label
          <select
            aria-label="Ukuran label"
            value={size}
            onChange={(e) => setSize(e.target.value as AwbSize)}
          >
            <option value="100x150">100 × 150 mm — Existing</option>
            <option value="75x150">75 × 150 mm — Vertikal</option>
          </select>
        </label>
        {loading && <p role="status">Menyiapkan preview…</p>}
        {pdf && (
          <iframe title={`Preview AWB ${size}`} src={pdf + "#toolbar=0"} />
        )}
        {error && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              requestAnimationFrame(() => setOpen(true));
            }}
          >
            Coba lagi
          </button>
        )}
        <p>
          PDF dibuka untuk dicetak pada ukuran asli / 100%, tanpa fit-to-page.
        </p>
      </ActionDialog>
    </div>
  );
}
