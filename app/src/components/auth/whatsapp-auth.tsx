"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle, ShieldCheck } from "lucide-react";
import { Button, Input, Label } from "./lumen";
export function WhatsAppAuth({
  link = false,
  accountType = "customer",
  redirectTo = "/account",
}: {
  link?: boolean;
  accountType?: "customer" | "seller";
  redirectTo?: string;
}) {
  const [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState<{
      whatsappUrl: string;
      expiresAt: string;
      phone: string;
    } | null>(null),
    [state, setState] = useState("");
  const guard = useRef(false);
  const [confirmation, setConfirmation] = useState<{
    id: string;
    token: string;
  } | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const capture = () => {
      const match = /^#confirm=([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(
        window.location.hash,
      );
      if (match) {
        setState("");
        setChallenge(null);
        setMessage("");
        setConfirmation({ id: match[1], token: match[2] });
        // Fragment is never sent to the server; remove it from visible history.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    };
    capture();
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, []);
  const target =
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(redirectTo) &&
    (accountType === "seller" || !redirectTo.startsWith("/admin"))
      ? redirectTo
      : accountType === "seller"
        ? "/admin"
        : "/account";
  async function api(action: string, fields = {}) {
    const r = await fetch("/api/v1/auth/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...fields }),
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error?.message || "Verifikasi belum berhasil.");
    return data.data;
  }
  async function run(action: "start" | "finish" | "unlink" | "confirm") {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(
        action,
        action === "start"
          ? {
              phone,
              accountType,
              purpose: link ? "link" : "login",
              ...(link ? { password } : {}),
            }
          : action === "confirm"
            ? confirmation || {}
            : action === "finish"
              ? { code }
              : { password, accountType },
      );
      if (action === "start") {
        setChallenge(result);
        setPassword("");
        setState("waiting");
      } else if (
        [
          "profile_required",
          "seller_link_required",
          "account_link_required",
        ].includes(result.state)
      ) {
        setState(result.state);
        setConfirmation(null);
        setChallenge(null);
      } else {
        window.location.assign(
          result.redirectTo === "/admin" ? "/admin" : target,
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "WhatsApp belum tersedia.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!challenge) return;
    let cancelled = false,
      running = false;
    const timer = setInterval(() => {
      if (running || document.hidden) return;
      running = true;
      void api("status")
        .then((s) => {
          if (!cancelled) setState(s.state);
        })
        .catch(() => {
          if (!cancelled)
            setMessage("Status belum dapat diperiksa. Email tetap tersedia.");
        })
        .finally(() => {
          running = false;
        });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [challenge]);
  const ended = ["expired", "locked", "failed"].includes(state);
  return (
    <div className="auth-content wa-auth">
      <div className="wa-symbol" aria-hidden="true">
        {[
          "profile_required",
          "account_link_required",
          "seller_link_required",
        ].includes(state) ? (
          <Check />
        ) : confirmation ? (
          <ShieldCheck />
        ) : (
          <MessageCircle />
        )}
      </div>
      <div className="auth-heading">
        <h1>
          {["account_link_required", "seller_link_required"].includes(state)
            ? "Tautkan akun Anda"
            : state === "profile_required"
              ? "Nomor terverifikasi"
              : confirmation
                ? "Satu langkah lagi"
                : challenge
                  ? "Lanjut di WhatsApp"
                  : link
                    ? "Tautkan WhatsApp"
                    : accountType === "seller"
                      ? "Masuk dashboard"
                      : "Masuk atau daftar"}
        </h1>
        <p>
          {["account_link_required", "seller_link_required"].includes(state)
            ? "Nomor terverifikasi. Masuk sekali dengan email untuk menautkannya."
            : state === "profile_required"
              ? "Lengkapi akun Anda untuk melanjutkan."
              : confirmation
                ? "Konfirmasi permintaan yang Anda mulai."
                : challenge
                  ? "Kirim pesan, lalu buka tautan balasannya."
                  : "Gunakan nomor WhatsApp Anda."}
        </p>
      </div>
      {["seller_link_required", "account_link_required"].includes(state) ? (
        <div className="auth-form">
          <p className="wa-caption">
            Buka Keamanan Akun setelah masuk, lalu pilih Tautkan WhatsApp.
          </p>
          <Link className="wa-primary" href="/login?redirectTo=%2Fadmin">
            Masuk dashboard seller
          </Link>
          {state === "account_link_required" && (
            <Link
              className="wa-text-button"
              href="/login?redirectTo=%2Faccount%2Fsecurity"
            >
              Masuk akun customer
            </Link>
          )}
        </div>
      ) : state === "profile_required" ? (
        <div className="auth-form">
          <Link className="wa-primary" href="/register">
            Lengkapi pendaftaran <ArrowRight size={18} />
          </Link>
          <p className="wa-caption">
            Sudah punya akun? Masuk dengan email untuk menautkan nomor.
          </p>
        </div>
      ) : confirmation ? (
        <div className="auth-form">
          <Button
            className="wa-primary"
            disabled={busy}
            onClick={() => void run("confirm")}
          >
            Konfirmasi &amp; Lanjutkan <ArrowRight size={18} />
          </Button>
          <p className="wa-caption">
            Gunakan browser tempat Anda memulai. Jika berbeda, kembali ke
            halaman awal dan gunakan kode cadangan.
          </p>
        </div>
      ) : !challenge ? (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run("start");
          }}
        >
          <div className="wa-field">
            <Label htmlFor="wa-phone">Nomor WhatsApp</Label>
            <Input
              id="wa-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              maxLength={24}
              placeholder="0812 3456 7890"
            />
          </div>
          {link && (
            <div className="wa-field">
              <Label htmlFor="wa-password">Password akun</Label>
              <Input
                id="wa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={256}
              />
            </div>
          )}
          <Button className="wa-primary" type="submit" disabled={busy}>
            Lanjutkan <ArrowRight size={18} />
          </Button>
          {link && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !password}
              onClick={() => {
                if (window.confirm("Lepaskan nomor WhatsApp dari akun ini?"))
                  void run("unlink");
              }}
            >
              Lepaskan nomor
            </Button>
          )}
        </form>
      ) : (
        <div className="auth-form">
          <div className="wa-destination">
            <MessageCircle size={20} />
            <span>
              WhatsApp <strong>{challenge.phone}</strong>
            </span>
          </div>
          {!ended && (
            <a
              className="wa-primary"
              href={challenge.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka WhatsApp <ArrowRight size={18} />
            </a>
          )}
          <p className="wa-caption" role="status">
            {ended
              ? "Permintaan berakhir. Silakan mulai kembali."
              : state === "reply_sent"
                ? "Tautan konfirmasi sudah dikirim."
                : "Menunggu konfirmasi Anda."}
          </p>
          {!ended && (
            <>
              <button
                className="wa-text-button"
                type="button"
                aria-expanded={fallback}
                onClick={() => setFallback(!fallback)}
              >
                Gunakan kode cadangan
              </button>
              {fallback && (
                <form
                  className="wa-fallback"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("finish");
                  }}
                >
                  <Label htmlFor="wa-code">Kode dari WhatsApp</Label>
                  <Input
                    id="wa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                  <Button
                    className="wa-primary"
                    type="submit"
                    disabled={busy || code.length !== 6}
                  >
                    Konfirmasi &amp; Lanjutkan
                  </Button>
                </form>
              )}
            </>
          )}
          <button
            className="wa-text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setChallenge(null);
              setCode("");
              setState("");
              setFallback(false);
            }}
          >
            {" "}
            {ended ? "Mulai kembali" : "Ganti nomor"}
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className="auth-feedback">
        {busy ? "Memproses…" : message}
      </p>
      <div className="wa-divider">
        <span>atau</span>
      </div>
      <Link
        className="wa-email"
        href={"/login?redirectTo=" + encodeURIComponent(target)}
      >
        Masuk dengan email
      </Link>
      {!link &&
        !challenge &&
        !confirmation &&
        !state &&
        accountType === "customer" && (
          <Link
            className="wa-text-button"
            href="/whatsapp?account=seller&redirectTo=%2Fadmin"
          >
            Masuk dashboard seller dengan WhatsApp
          </Link>
        )}
    </div>
  );
}
