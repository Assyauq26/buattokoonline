"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Label } from "./lumen";
export function WhatsAppAuth({
  link = false,
  redirectTo = "/account",
}: {
  link?: boolean;
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
  const target =
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(redirectTo) &&
    !redirectTo.startsWith("/admin")
      ? redirectTo
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
  async function run(action: "start" | "finish" | "unlink") {
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
              purpose: link ? "link" : "login",
              ...(link ? { password } : {}),
            }
          : action === "finish"
            ? { code }
            : { password },
      );
      if (action === "start") {
        setChallenge(result);
        setPassword("");
        setState("waiting");
      } else if (result.state === "profile_required") {
        setState(result.state);
        setChallenge(null);
      } else {
        window.location.assign(target);
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
  return (
    <div className="auth-content">
      <div className="auth-heading">
        <h1>{link ? "Tautkan WhatsApp" : "Masuk dengan WhatsApp"}</h1>
        <p>
          {link
            ? "Konfirmasi akun Anda dan kepemilikan nomor."
            : "Verifikasi nomor melalui WhatsApp pusat Buattokosendiri."}
        </p>
      </div>
      {state === "profile_required" ? (
        <div className="auth-form">
          <p>
            Nomor berhasil diverifikasi. Untuk akun baru, lengkapi profil dan
            verifikasi email. Jika sudah punya akun, masuk dengan email lalu
            tautkan WhatsApp di keamanan akun.
          </p>
          <Link className="auth-wa-link" href="/register">
            Lengkapi pendaftaran
          </Link>
          <Link href="/login">Masuk dengan email</Link>
        </div>
      ) : !challenge ? (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run("start");
          }}
        >
          <Label htmlFor="wa-phone">Nomor WhatsApp</Label>
          <Input
            id="wa-phone"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            maxLength={24}
            placeholder="081234567890"
          />
          {link && (
            <>
              <Label htmlFor="wa-password">Password akun saat ini</Label>
              <Input
                id="wa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={256}
              />
            </>
          )}
          <Button type="submit" disabled={busy}>
            Lanjutkan
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
              Lepaskan nomor dari akun
            </Button>
          )}
        </form>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run("finish");
          }}
        >
          <p>
            Kirim pesan yang sudah disiapkan dari nomor {challenge.phone}.
            Masukkan kode rahasia yang dibalas ke WhatsApp Anda.
          </p>
          <a
            className="auth-wa-link"
            href={challenge.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buka WhatsApp
          </a>
          <p className="auth-otp-note">
            Hanya masukkan kode di halaman yang Anda buka sendiri. Jangan
            bagikan kode kepada siapa pun.
          </p>
          <Label htmlFor="wa-code">Kode verifikasi</Label>
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
          <p className="text-sm">
            {state === "reply_sent"
              ? "Balasan kode telah dikirim ke WhatsApp."
              : state === "expired"
                ? "Kode kedaluwarsa. Mulai kembali."
                : state === "locked"
                  ? "Batas percobaan tercapai. Mulai kembali."
                  : "Menunggu verifikasi WhatsApp."}
          </p>
          <Button
            type="submit"
            disabled={
              busy ||
              code.length !== 6 ||
              ["expired", "locked", "failed"].includes(state)
            }
          >
            Verifikasi dan lanjutkan
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => {
              setChallenge(null);
              setCode("");
              setState("");
            }}
          >
            Mulai kembali
          </Button>
        </form>
      )}
      <p role="status" aria-live="polite" className="auth-feedback">
        {busy ? "Memproses…" : message}
      </p>
      <p className="auth-switch">
        <Link href={"/login?redirectTo=" + encodeURIComponent(target)}>
          Gunakan email dan password
        </Link>
      </p>
    </div>
  );
}
