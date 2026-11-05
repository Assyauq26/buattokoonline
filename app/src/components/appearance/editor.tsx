"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  appearanceSchema,
  type StoreAppearanceV1,
} from "@/modules/appearance/schema";
import { contrastErrors } from "@/modules/appearance/contrast";
import {
  appearanceAction,
  appearanceHistory,
  loadAppearance,
} from "@/modules/appearance/actions";
import { Controls, TABS, type Change } from "./controls";
import { useDirtyGuard } from "./use-dirty-guard";
import { Button } from "@/components/ui/button";
type Snapshot = {
  config: StoreAppearanceV1;
  publishedConfig?: StoreAppearanceV1;
  draftVersion: number;
  publishedVersion: number;
};
type Revision = { version: number; action: string; createdAt: string };
export function AppearanceEditor({
  initial,
  canUpdate,
  canPublish,
}: {
  initial: Snapshot;
  canUpdate: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial),
    [draft, setDraft] = useState(initial.config),
    [tab, setTab] = useState<string>(TABS[0]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [revisions, setRevisions] = useState<Revision[]>([]);
  const [width, setWidth] = useState(390),
    [available, setAvailable] = useState(390),
    [nonce, setNonce] = useState(""),
    [ready, setReady] = useState(0),
    [mobilePreview, setMobilePreview] = useState(false);
  const [logoBytes, setLogoBytes] = useState<{
    id: string;
    bytes: ArrayBuffer;
  } | null>(null);
  const sentLogo = useRef<string | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null),
    container = useRef<HTMLDivElement>(null),
    errorRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.config);
  const validation = useMemo(() => appearanceSchema.safeParse(draft), [draft]),
    warnings = validation.success ? contrastErrors(validation.data) : [];
  useDirtyGuard(dirty || busy);
  const change: Change = (fn) => {
    setDraft((previous) => {
      const next = structuredClone(previous);
      fn(next);
      return next;
    });
    setError("");
    setMessage("");
  };
  useEffect(() => {
    setNonce(crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setAvailable(Math.max(1, entries[0].contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mobilePreview]);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.source === iframe.current?.contentWindow &&
        e.origin === "null" &&
        e.data?.type === "appearance-ready" &&
        e.data.nonce === nonce
      ) {
        sentLogo.current = null;
        setReady((value) => value + 1);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [nonce]);
  const logoId = draft.identity.logoAssetId;
  useEffect(() => {
    setLogoBytes(null);
    if (!logoId) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/admin/store-branding/${logoId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (active && bytes.byteLength <= 2097152)
          setLogoBytes({ id: logoId, bytes });
      } catch {}
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [logoId]);
  useEffect(() => {
    if (!ready || !validation.success) return;
    const message: {
      type: string;
      nonce: string;
      config: StoreAppearanceV1;
      logo?: ArrayBuffer;
    } = { type: "appearance", nonce, config: validation.data };
    if (sentLogo.current !== logoId) {
      if (logoBytes?.id === logoId) {
        message.logo = logoBytes.bytes;
        sentLogo.current = logoId;
      } else sentLogo.current = null;
    }
    iframe.current?.contentWindow?.postMessage(message, "*");
  }, [validation, ready, nonce, logoId, logoBytes]);
  async function history(before?: number) {
    const r = await appearanceHistory(before);
    if (r.ok && r.data)
      setRevisions((old) =>
        before === undefined ? r.data! : [...old, ...r.data!],
      );
    else setError(r.error ?? "Riwayat gagal dimuat");
  }
  useEffect(() => {
    if (tab === TABS[8]) void history();
  }, [tab]);
  async function reload() {
    if (
      dirty &&
      !window.confirm("Muat ulang akan membuang perubahan lokal. Lanjutkan?")
    )
      return;
    setBusy(true);
    try {
      const r = await loadAppearance();
      if (r.ok && r.data) {
        setSaved(r.data);
        router.refresh();
        setDraft(r.data.config);
        setError("");
        setMessage("Draft terbaru dimuat.");
      } else setError(r.error ?? "Gagal memuat draft");
    } finally {
      setBusy(false);
    }
  }
  const changes = (Object.keys(draft) as (keyof StoreAppearanceV1)[])
    .filter(
      (k) =>
        k !== "schemaVersion" &&
        JSON.stringify(draft[k]) !== JSON.stringify(saved.publishedConfig?.[k]),
    )
    .map(
      (k) =>
        ({
          identity: "Identitas Toko",
          colors: "Warna",
          gradients: "Gradasi",
          header: "Header",
          mobile: "Navigasi",
          footer: "Footer",
          styling: "Tombol/Kartu",
          schemaVersion: "",
        })[k],
    );
  async function act(
    kind: "save" | "publish" | "discard" | "reset" | "rollback",
    revision?: number,
  ) {
    if (kind === "publish" && (dirty || !validation.success || warnings.length))
      return;
    if (
      kind !== "save" &&
      !window.confirm(
        kind === "publish"
          ? `Terbitkan draft v${saved.draftVersion}? Perubahan: ${changes.join(", ") || "tidak ada perubahan nilai"}. Tampilan ini akan terlihat customer. Published saat ini v${saved.publishedVersion}.`
          : kind === "rollback"
            ? `Terbitkan kembali revisi ${revision}? Draft saat ini tetap disimpan.`
            : kind === "discard"
              ? "Buang draft server dan salin tampilan published?"
              : "Reset draft ke toko ini? Published tidak berubah.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await appearanceAction({
        kind,
        draftVersion: saved.draftVersion,
        publishedVersion: saved.publishedVersion,
        ...(kind === "save" ? { config: draft } : {}),
        ...(revision !== undefined ? { revision } : {}),
      });
      if (r.ok && r.data) {
        setSaved(r.data);
        if (kind !== "rollback") setDraft(r.data.config);
        setMessage(
          kind === "publish" || kind === "rollback"
            ? "Tampilan published diperbarui."
            : "Draft tersimpan. Visitor tetap melihat published.",
        );
        if (tab === TABS[8]) void history();
      } else setError(r.error ?? "Perubahan gagal. Coba lagi.");
    } catch {
      setError("Koneksi terputus. Muat ulang untuk memeriksa versi tersimpan.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (file.size > 2097152) {
      setError("Logo maksimal 2 MiB");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("image", file);
      form.set("requestId", crypto.randomUUID());
      const r = await fetch("/api/v1/admin/store-branding", {
        method: "POST",
        body: form,
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message ?? "Upload gagal");
      change((d) => (d.identity.logoAssetId = body.data.id));
      setMessage("Logo diunggah privat. Simpan draft untuk menyertakannya.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
    }
  }
  const scale = Math.min(1, available / width);
  return (
    <div className="min-w-0 space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Tampilan toko
          </p>
          <h1 className="mt-1 text-2xl font-bold">Customize / Dekorasi Toko</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Draft v{saved.draftVersion} · Published v{saved.publishedVersion} ·{" "}
            {dirty ? "Perubahan belum disimpan" : "Tersimpan"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => {
              if (window.confirm("Batalkan perubahan lokal?")) {
                setDraft(saved.config);
                setError("");
              }
            }}
          >
            Batalkan
          </Button>
          <Button
            variant="outline"
            disabled={busy || !canUpdate || !dirty || !validation.success}
            onClick={() => act("save")}
          >
            Simpan Draft
          </Button>
          <Button
            disabled={
              busy ||
              !canPublish ||
              dirty ||
              !validation.success ||
              warnings.length > 0
            }
            onClick={() => act("publish")}
          >
            {busy ? "Memproses…" : "Terbitkan"}
          </Button>
        </div>
      </header>
      <div aria-live="polite" role="status" className="text-sm text-zinc-700">
        {message}
      </div>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          {error}
          <button
            className="ml-3 min-h-11 underline"
            disabled={busy}
            onClick={reload}
          >
            Muat ulang draft
          </button>
        </div>
      )}
      {!validation.success && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          {validation.error.issues.map((i) => (
            <p key={i.path.join(".")}>
              {i.path.join(".")}: {i.message}
            </p>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <details className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {warnings.length} masalah kontras — Publish diblokir
          </summary>
          <ul className="mt-2 list-inside list-disc">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex gap-2 lg:hidden">
        <Button
          variant={!mobilePreview ? "default" : "outline"}
          onClick={() => setMobilePreview(false)}
        >
          Editor
        </Button>
        <Button
          variant={mobilePreview ? "default" : "outline"}
          onClick={() => setMobilePreview(true)}
        >
          Lihat Preview
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section
          className={`${mobilePreview ? "hidden lg:block" : ""} min-w-0 rounded-2xl border border-zinc-200 bg-white`}
          aria-label="Kontrol dekorasi"
        >
          <nav
            aria-label="Kategori pengaturan"
            className="flex flex-wrap gap-1 border-b p-3"
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`min-h-11 rounded-lg px-3 text-xs font-medium ${tab === t ? "bg-black text-white" : "bg-zinc-100 text-zinc-700"}`}
              >
                {t}
              </button>
            ))}
          </nav>
          <fieldset
            disabled={!canUpdate || busy}
            className="max-h-[70vh] space-y-5 overflow-y-auto p-4"
          >
            <legend className="sr-only">{tab}</legend>
            {tab !== TABS[8] && (
              <Controls
                tab={tab}
                draft={draft}
                change={change}
                upload={upload}
                busy={busy}
              />
            )}
          </fieldset>
          {tab === TABS[8] && (
            <div className="space-y-3 p-4">
              {revisions.map((r) => (
                <div key={r.version} className="rounded-xl border p-3">
                  <p className="text-sm font-semibold">
                    Revisi {r.version} · {r.action}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {new Date(r.createdAt).toLocaleString("id-ID")}
                  </p>
                  <Button
                    className="mt-2"
                    variant="outline"
                    disabled={busy || !canPublish || dirty}
                    onClick={() => act("rollback", r.version)}
                  >
                    Rollback
                  </Button>
                </div>
              ))}
              {revisions.length >= 25 && (
                <button
                  className="min-h-11 text-sm underline"
                  onClick={() => history(revisions.at(-1)?.version)}
                >
                  Muat riwayat lebih lama
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3 border-t p-4">
            <button
              disabled={busy || !canUpdate}
              className="min-h-11 text-sm underline"
              onClick={() => act("discard")}
            >
              Buang Draft
            </button>
            <button
              disabled={busy || !canUpdate}
              className="min-h-11 text-sm underline"
              onClick={() => act("reset")}
            >
              Reset Monochrome
            </button>
          </div>
        </section>
        <section
          className={`${!mobilePreview ? "hidden lg:block" : ""} min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100`}
          aria-label="Live preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white p-3">
            <span className="text-xs text-zinc-600">
              Preview privat · baca-saja
            </span>
            <div className="flex gap-1">
              {[390, 768, 1360].map((w) => (
                <button
                  className={`min-h-11 rounded-lg px-3 text-xs ${width === w ? "bg-black text-white" : "bg-zinc-100"}`}
                  aria-pressed={width === w}
                  key={w}
                  onClick={() => setWidth(w)}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
          <div
            ref={container}
            className="w-full overflow-hidden"
            style={{ height: Math.ceil(1000 * scale) }}
          >
            {nonce && (
              <iframe
                ref={iframe}
                title="Preview draft toko"
                src={`/store-customize-preview#${nonce}`}
                sandbox="allow-scripts"
                className="origin-top-left border-0 bg-white"
                style={{ width, height: 1000, transform: `scale(${scale})` }}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
