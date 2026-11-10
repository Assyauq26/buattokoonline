"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function PreparePackageButton({ orderId }: { orderId: string }) {
  const locked = useRef(false),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <button
        className="flow-primary"
        disabled={busy}
        onClick={async () => {
          if (locked.current) return;
          locked.current = true;
          setBusy(true);
          setError("");
          try {
            const r = await fetch(`/api/v1/admin/orders/${orderId}/prepare`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            const j = await r.json();
            if (!r.ok || !j.success)
              throw Error(j.error?.message || "Penyiapan paket gagal");
            router.refresh();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Koneksi terputus. Periksa status terbaru.",
            );
          } finally {
            locked.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Menyiapkan…" : "Siapkan paket"}
      </button>
      {error && (
        <p role="alert" className="flow-error">
          {error}
        </p>
      )}
    </div>
  );
}
