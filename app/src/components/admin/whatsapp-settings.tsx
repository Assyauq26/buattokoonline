"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
type Connection = {
  status: string;
  phone: string | null;
  expectedPhone: string;
};
type Entry = {
  id: string;
  order_id: string;
  event_type: string;
  state: string;
  recipient_suffix: string;
  created_at: string;
  retryable?: boolean;
};
const labels: Record<string, string> = {
  ready: "Terhubung",
  disconnected: "Belum terhubung",
  qr_ready: "Pindai kode QR",
  authenticating: "Memverifikasi sambungan",
  initializing: "Menyiapkan sambungan",
  failed: "Perlu dihubungkan ulang",
  action_required: "Periksa WhatsApp Anda",
  queued: "Dalam antrean",
  submitted: "Dikirim ke WhatsApp",
  delivered: "Terkirim ke penerima",
  read: "Dibaca",
  unknown: "Hasil belum dapat dipastikan",
  expired: "Kedaluwarsa",
  cancelled: "Dihentikan",
  superseded: "Digantikan status terbaru",
};
async function api<T>(action: string, values = {}) {
  const r = await fetch("/api/v1/admin/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error?.message || "Koneksi belum tersedia.");
  return data.data as T;
}
export function WhatsAppSettings() {
  const [connection, setConnection] = useState<Connection | null>(null),
    [qr, setQr] = useState<string | null>(null),
    [history, setHistory] = useState<Entry[]>([]);
  const [enabled, setEnabled] = useState(false),
    [preparing, setPreparing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = useRef(false),
    mounted = useRef(true);
  const refresh = useCallback(async () => {
    const state = await api<Connection>("status");
    if (!mounted.current) return;
    setConnection(state);
    if (state.status === "qr_ready") {
      const next = await api<{ qrCode: string }>("qr");
      if (
        mounted.current &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(next.qrCode)
      )
        setQr(next.qrCode);
    } else setQr(null);
  }, []);
  const run = useCallback(
    async (action: string, values = {}) => {
      if (active.current) return;
      active.current = true;
      setBusy(true);
      setMessage("");
      try {
        await api(action, values);
        await refresh();
        const nextHistory = await api<Entry[]>("history");
        if (mounted.current) setHistory(nextHistory);
      } catch (e) {
        setQr(null);
        setMessage(e instanceof Error ? e.message : "Koneksi belum tersedia.");
      } finally {
        active.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => {
    mounted.current = true;
    void Promise.all([
      refresh(),
      api<{ enabled: boolean; preparing: boolean }>("preferences").then((p) => {
        if (mounted.current) {
          setEnabled(p.enabled);
          setPreparing(p.preparing);
        }
      }),
      api<Entry[]>("history").then((h) => {
        if (mounted.current) setHistory(h);
      }),
    ]).catch(() => {
      if (mounted.current)
        setMessage("WhatsApp belum dapat dihubungi. Periksa status lagi.");
    });
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (
      !connection ||
      !["qr_ready", "authenticating", "initializing"].includes(
        connection.status,
      )
    )
      return;
    let running = false;
    const timer = setInterval(() => {
      if (running || document.hidden) return;
      running = true;
      void refresh()
        .catch(() => setQr(null))
        .finally(() => {
          running = false;
        });
    }, 5000);
    const hide = () => {
      if (document.hidden) setQr(null);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [connection, refresh]);
  async function save() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ pending: boolean }>("save", {
        enabled,
        preparing,
      });
      setMessage(
        result.pending
          ? "Pilihan tersimpan. Menunggu sinkronisasi; pesan yang sudah antre di pusat belum tentu berhenti sampai tersambung kembali."
          : "Preferensi tersimpan.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Belum tersimpan.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">
          Integrasi WhatsApp{" "}
          <span className="text-xs font-normal bg-surface rounded px-2 py-1">
            Uji terbatas
          </span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Kirim pembaruan pesanan dari nomor toko Anda.
        </p>
      </header>
      <section className="rounded-xl border border-line p-5 space-y-4">
        <div className="flex items-center gap-3">
          <MessageCircle aria-hidden />
          <div>
            <h2 className="font-semibold">
              {connection
                ? labels[connection.status] || "Periksa sambungan"
                : "Memeriksa sambungan"}
            </h2>
            <p>
              {connection?.phone ||
                connection?.expectedPhone ||
                "Nomor belum tersedia"}
            </p>
          </div>
        </div>
        {qr && (
          <div className="space-y-3">
            <img
              src={qr}
              alt="Kode QR privat untuk menghubungkan WhatsApp toko"
              width={240}
              height={240}
              className="mx-auto max-w-full"
            />
            <p className="text-sm">
              Buka WhatsApp → Perangkat tertaut → Tautkan perangkat. Gunakan
              nomor toko yang tertera di atas.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || connection?.status === "ready"}
            onClick={() => run("connect")}
          >
            {connection?.status === "ready"
              ? "Terhubung"
              : "Hubungkan WhatsApp"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run("status")}
          >
            <RefreshCw size={16} />
            Periksa status
          </Button>
          {connection?.status === "ready" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Putuskan WhatsApp dan hentikan pesan yang masih antre?",
                  )
                )
                  void run("disconnect");
              }}
            >
              Putuskan
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground flex gap-2">
          <ShieldCheck size={18} className="shrink-0" />
          Kode QR hanya tersedia untuk pemilik toko. Chat Toko tetap memakai
          nomor layanan pelanggan.
        </p>
      </section>
      <section className="rounded-xl border border-line p-5 space-y-4">
        <h2 className="font-semibold">Notifikasi pesanan</h2>
        <label className="flex items-center justify-between gap-4">
          Aktifkan notifikasi transaksi
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-current"
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          Sertakan status sedang disiapkan
          <input
            type="checkbox"
            checked={preparing}
            onChange={(e) => setPreparing(e.target.checked)}
            className="h-5 w-5 accent-current"
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Hanya dikirim kepada penerima uji yang menyetujui notifikasi. Login
          WhatsApp menggunakan nomor pusat Buattokosendiri.
        </p>
        <Button disabled={busy} onClick={save}>
          Simpan preferensi
        </Button>
      </section>
      <p role="status" aria-live="polite" className="text-sm min-h-5">
        {busy ? "Memproses…" : message}
      </p>
      <section className="rounded-xl border border-line p-5">
        <h2 className="font-semibold mb-3">Riwayat pengiriman</h2>
        {!history.length ? (
          <p className="text-sm text-muted-foreground">Belum ada pengiriman tercatat.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="py-3 text-sm">
                <p className="font-medium break-all">{h.order_id}</p>
                <p>
                  ••••{h.recipient_suffix} · {labels[h.state] || h.state}
                </p>
                <time>{new Date(h.created_at).toLocaleString("id-ID")}</time>
                {h.retryable && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => run("retry", { id: h.id })}
                  >
                    Coba lagi
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
