"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Info,
  LoaderCircle,
  Clock,
  CheckCircle2,
  Upload,
} from "lucide-react";
import type { resolutionView } from "@/modules/orders/resolution.service";
import { refundBankSchema } from "@/modules/orders/resolution-policy";
import {
  customerRefundView,
  maskBankNumber,
  customerRefundEvent,
} from "@/lib/customer-refund-view";
import { StatusToast } from "@/components/ui/status-toast";
import { formatIDR } from "@/lib/money";
type View = Awaited<ReturnType<typeof resolutionView>>;
type Bank = { bank: string; number: string; holder: string };
export function CustomerRefund({
  initial,
  caseId,
}: {
  initial: View;
  caseId: string;
}) {
  const [view, setView] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [toast, setToast] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [attested, setAttested] = useState(false);
  const c = view.cases.find((c) => c.id === caseId)!;
  const ui = customerRefundView(c);
  const [draft, setDraft] = useState<Bank>(
      c.bank || { bank: "", number: "", holder: "" },
    ),
    [errors, setErrors] = useState<Partial<Bank>>({});
  const form = useRef<HTMLFormElement>(null),
    alive = useRef(true),
    lock = useRef(false),
    router = useRouter();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!lock.current)
      setView((current) =>
        (initial.cases.find((x) => x.id === caseId)?.revision ?? -1) >=
        (current.cases.find((x) => x.id === caseId)?.revision ?? -1)
          ? initial
          : current,
      );
  }, [initial, caseId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);
  async function latest() {
    const r = await fetch(`/api/v1/order-resolutions?orderId=${view.orderId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw Error("Status belum dapat diperiksa");
    return j.data as View;
  }
  function success(v: View) {
    if (!alive.current) return;
    setView(v);
    setEditing(false);
    setUncertain(false);
    setError("");
    setToast("Rekening berhasil disimpan");
    router.refresh();
  }
  async function saveBank() {
    if (lock.current) return;
    const parsed = refundBankSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Partial<Bank> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof Bank;
        next[k] =
          k === "number"
            ? "Gunakan 5–30 digit nomor rekening."
            : k === "holder"
              ? "Isi nama pemilik rekening (2–120 karakter)."
              : "Isi nama bank (2–80 karakter).";
      }
      setErrors(next);
      const firstInvalid = (["bank", "number", "holder"] as const).find(
        (k) => next[k],
      );
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)
        ?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setErrors({});
    setToast("");
    const bank = parsed.data,
      revision = c.revision;
    try {
      if (uncertain) {
        const v = await latest();
        const fresh = v.cases.find((x) => x.id === caseId);
        if (
          fresh?.bank &&
          fresh.revision > revision &&
          Object.keys(bank).every(
            (k) => fresh.bank?.[k as keyof Bank] === bank[k as keyof Bank],
          )
        ) {
          success(v);
          return;
        }
        if (alive.current) {
          setView(v);
          setUncertain(false);
          setError(
            "Status terbaru dimuat. Periksa data sebelum menyimpan kembali.",
          );
        }
        return;
      }
      let r: Response;
      let j: {
        success: boolean;
        data: { state: View["cases"][number]["state"]; revision: number };
        error?: { message?: string };
      };
      try {
        r = await fetch("/api/v1/order-resolutions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: c.id,
            operation: "command",
            data: { action: "bank", revision, bank },
          }),
          signal: AbortSignal.timeout(20000),
        });
        j = await r.json();
        if (
          r.ok &&
          j.success &&
          (!j.data?.state || !Number.isInteger(j.data.revision))
        )
          throw Error("Respons penyimpanan belum lengkap");
      } catch {
        try {
          const v = await latest();
          const fresh = v.cases.find((x) => x.id === caseId);
          if (
            fresh?.bank &&
            fresh.revision > revision &&
            Object.keys(bank).every(
              (k) => fresh.bank?.[k as keyof Bank] === bank[k as keyof Bank],
            )
          ) {
            success(v);
            return;
          }
          if (alive.current) {
            setView(v);
            setError(
              "Rekening belum terkonfirmasi tersimpan. Periksa data dan coba lagi.",
            );
          }
          return;
        } catch {
          if (alive.current) {
            setUncertain(true);
            setError(
              "Hasil penyimpanan belum pasti. Periksa status sebelum mencoba kembali.",
            );
          }
          return;
        }
      }
      if (!r.ok || !j.success) {
        if (r.status === 409) {
          const v = await latest();
          if (alive.current) setView(v);
        }
        throw Error(j.error?.message || "Rekening belum tersimpan. Coba lagi.");
      }
      // The committed server response is authoritative even if the following read fails.
      const fallback = {
        ...view,
        cases: view.cases.map((x) =>
          x.id === caseId
            ? {
                ...x,
                state: j.data.state,
                revision: j.data.revision,
                bank,
                hasBank: true,
              }
            : x,
        ),
      };
      success(await latest().catch(() => fallback));
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Rekening belum tersimpan. Coba lagi.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function action(action: string, data: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/order-resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: c.id,
          operation: "command",
          data: { action, revision: c.revision, ...data },
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success)
        throw Error(j.error?.message || "Belum tersimpan");
      const v = await latest();
      if (alive.current) {
        setView(v);
        setAttested(false);
        router.refresh();
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Periksa status sebelum mencoba kembali.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function evidence(f: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const data = new FormData(f);
      data.set("id", c.id);
      data.set("kind", "evidence");
      const r = await fetch("/api/v1/order-resolutions", {
        method: "POST",
        body: data,
      });
      const j = await r.json();
      if (!r.ok || !j.success)
        throw Error(j.error?.message || "Unggahan belum tersimpan");
      const v = await latest();
      if (alive.current) {
        setView(v);
        f.reset();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unggahan gagal");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="customer-refund customer-order-detail">
      <Link className="customer-back" href={`/orders/${view.orderId}`}>
        <ArrowLeft size={18} />
        Detail pesanan
      </Link>
      <h1>{ui.approved ? "Pengembalian dana" : "Retur & pengembalian"}</h1>
      <section className="customer-panel refund-summary" aria-live="polite">
        <span className="refund-badge" data-received={ui.received}>
          {ui.label}
        </span>
        {ui.approved && (
          <>
            <strong className="refund-amount">
              {formatIDR(c.refundAmount)}
            </strong>
            {["WAITING_BANK", "READY"].includes(c.state) && (
              <p>Penjual akan mengembalikan dana</p>
            )}
          </>
        )}
        <p>{ui.description}</p>
        {ui.approved && (
          <dl className="customer-totals">
            <div>
              <dt>Produk</dt>
              <dd>{formatIDR(c.productsAmount)}</dd>
            </div>
            <div>
              <dt>Ongkir</dt>
              <dd>{formatIDR(c.shippingAmount)}</dd>
            </div>
            <div>
              <dt>Total pengembalian</dt>
              <dd>{formatIDR(c.refundAmount)}</dd>
            </div>
          </dl>
        )}
      </section>
      {ui.approved && (
        <section className="customer-panel">
          <h2>Rekening pengembalian</h2>
          {c.bank && !editing ? (
            <>
              <p>
                {c.bank.bank} · {maskBankNumber(c.bank.number)}
              </p>
              <p>{c.bank.holder}</p>
              {ui.canEditBank && (
                <button
                  className="customer-secondary"
                  onClick={() => {
                    setDraft(c.bank!);
                    setEditing(true);
                  }}
                >
                  Ubah rekening
                </button>
              )}
            </>
          ) : ui.canEditBank ? (
            <form
              ref={form}
              noValidate
              aria-busy={busy}
              onSubmit={(e) => {
                e.preventDefault();
                void saveBank();
              }}
            >
              {(["bank", "number", "holder"] as const).map((k) => (
                <div key={k}>
                  <label htmlFor={"refund-" + k}>
                    {k === "bank"
                      ? "Bank"
                      : k === "number"
                        ? "Nomor rekening"
                        : "Nama pemilik rekening"}
                  </label>
                  <input
                    id={"refund-" + k}
                    name={k}
                    list={k === "bank" ? "refund-banks" : undefined}
                    inputMode={k === "number" ? "numeric" : undefined}
                    autoComplete="off"
                    placeholder={
                      k === "bank"
                        ? "Pilih atau ketik nama bank"
                        : k === "number"
                          ? "Masukkan nomor rekening"
                          : "Sesuai nama di rekening"
                    }
                    maxLength={k === "bank" ? 80 : k === "number" ? 30 : 120}
                    value={draft[k]}
                    disabled={busy}
                    aria-invalid={!!errors[k]}
                    aria-describedby={
                      errors[k] ? "refund-error-" + k : undefined
                    }
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: e.target.value })
                    }
                  />
                  {errors[k] && (
                    <small id={"refund-error-" + k} className="customer-error">
                      {errors[k]}
                    </small>
                  )}
                </div>
              ))}
              <datalist id="refund-banks">
                {[
                  "BCA",
                  "BRI",
                  "BNI",
                  "Mandiri",
                  "BSI",
                  "CIMB Niaga",
                  "Bank Jago",
                ].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <button className="customer-primary" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin" />
                    Menyimpan…
                  </>
                ) : uncertain ? (
                  "Periksa status"
                ) : (
                  "Simpan rekening"
                )}
              </button>
              <p className="customer-helper">
                <Info size={16} />
                Pastikan data rekening sudah benar.
              </p>
            </form>
          ) : (
            <p>Rekening tidak tersedia untuk diubah pada tahap ini.</p>
          )}
          {error && (
            <p role="alert" className="customer-error">
              {error}
            </p>
          )}
        </section>
      )}
      {!ui.approved && error && (
        <p role="alert" className="customer-error">
          {error}
        </p>
      )}
      {c.transfer && (
        <section className="customer-panel">
          <h2>Transfer dicatat penjual</h2>
          <p>
            {formatIDR(c.transfer.amount)} ·{" "}
            {new Date(c.transfer.settledAt).toLocaleString("id-ID")}
          </p>
          <p>Referensi: {c.transfer.reference}</p>
          <a
            className="customer-secondary"
            href={`/api/v1/order-resolutions/proof?kind=transfer&id=${c.transfer.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Lihat bukti transfer
          </a>
          {["TRANSFER_RECORDED", "DISPUTED"].includes(c.state) && (
            <>
              <label className="customer-checkbox">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                />
                Saya sudah memeriksa rekening dan menerima dana.
              </label>
              <button
                className="customer-primary"
                disabled={busy || !attested}
                onClick={() => void action("received", { attested: true })}
              >
                Konfirmasi dana diterima
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("dispute", {
                    reason: new FormData(e.currentTarget).get("reason"),
                  });
                }}
              >
                <label>
                  Kendala penerimaan
                  <textarea
                    name="reason"
                    minLength={3}
                    maxLength={1500}
                    required
                  />
                </label>
                <button className="customer-secondary" disabled={busy}>
                  Laporkan kendala
                </button>
              </form>
            </>
          )}
        </section>
      )}
      {c.state === "WAITING_RETURN" && (
        <section className="customer-panel">
          <h2>Pengiriman retur</h2>
          <p>
            {c.returnTracking ||
              "Kembalikan barang sesuai kesepakatan dengan penjual."}
          </p>
          {["REQUIRED", "IN_TRANSIT"].includes(c.returnState) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action("return-shipped", {
                  tracking: new FormData(e.currentTarget).get("tracking"),
                });
              }}
            >
              <label>
                Nomor resi retur
                <input name="tracking" required minLength={5} maxLength={100} />
              </label>
              <button className="customer-primary" disabled={busy}>
                Simpan resi retur
              </button>
            </form>
          )}
        </section>
      )}
      <section className="customer-panel">
        <h2>Riwayat pengembalian dana</h2>
        <ol className="customer-refund-history">
          {c.events.map((e) => (
            <li key={e.id}>
              {e.action === "received" ? (
                <CheckCircle2 size={20} />
              ) : (
                <Clock size={20} />
              )}
              <div>
                <p>{customerRefundEvent(e.action, e.note)}</p>
                <small>
                  {new Date(e.createdAt).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <details className="customer-panel">
        <summary>Bukti pendukung</summary>
        {c.evidence.map((e) => (
          <a
            key={e.id}
            className="customer-secondary"
            target="_blank"
            rel="noreferrer"
            href={`/api/v1/order-resolutions/proof?kind=evidence&id=${e.id}`}
          >
            Lihat bukti
          </a>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void evidence(e.currentTarget);
          }}
        >
          <label>
            Foto atau dokumen (maks. 4 MB)
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
            />
          </label>
          <button className="customer-secondary" disabled={busy}>
            <Upload size={18} />
            Unggah bukti
          </button>
        </form>
      </details>
      {toast && <StatusToast message={toast} />}
    </div>
  );
}
