"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./lumen";
import { OtpInput } from "./otp-input";
import {
  asChallenge,
  clearRegistration,
  formatOtpTime,
  registrationFields,
  rememberRegistration,
  registrationNow,
  timedRegistration,
} from "./registration-state";
import {
  registrationStatusAction,
  resendRegistrationAction,
  verifyRegistrationAction,
} from "@/modules/auth/auth.actions";
import type {
  RegistrationChallenge,
  RegistrationFailure,
} from "@/modules/auth/registration-contract";

type Feedback = {
  error?: string;
  errorCode?: RegistrationFailure;
  message?: string;
};
export function RegistrationOtpStep({
  initial,
  onRestart,
}: {
  initial: RegistrationChallenge;
  onRestart: (reason?: string, code?: RegistrationFailure) => void;
}) {
  const router = useRouter();
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({});
  const [pending, setPending] = useState<"verify" | "resend" | "status" | null>(
    null,
  );
  const busy = useRef(false);
  const mounted = useRef(false);
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(() => registrationNow(initial));
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef("");
  const [resendRecoveries, setResendRecoveries] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const anchor = registrationNow(challenge);
    const startedAt = performance.now();
    setNow(anchor);
    const timer = setInterval(
      () => setNow(anchor + performance.now() - startedAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [challenge]);
  const adopt = useCallback((value: unknown) => {
    if (!mounted.current) return false;
    const next = asChallenge(value);
    if (!next) return false;
    setChallenge(next);
    rememberRegistration(next);
    return true;
  }, []);
  const recover = useCallback(async () => {
    try {
      const result = await timedRegistration(() =>
        registrationStatusAction(undefined, registrationFields(initial)),
      );
      if (!mounted.current) return false;
      if (adopt(result)) {
        setFeedback({
          message:
            "Status kode sudah diperbarui. Gunakan kode terbaru dari email Anda.",
        });
        return true;
      }
      if (
        result.errorCode === "CHALLENGE_MISSING" ||
        result.errorCode === "REGISTRATION_CONFLICT"
      ) {
        onRestart(result.error, result.errorCode);
        return false;
      }
    } catch {
      /* Preserve the opaque challenge when a response is lost. */
    }
    if (!mounted.current) return false;
    setFeedback({
      error:
        "Status kode belum dapat diperiksa. Coba lagi atau kirim ulang setelah jeda.",
    });
    return false;
  }, [initial, adopt, onRestart]);
  useEffect(() => {
    if (
      challenge.status !== "sending" ||
      pending ||
      verified ||
      resendRecoveries >= 4
    )
      return;
    const timer = setTimeout(
      async () => {
        // All status reads and mutations share one lock: a stale read cannot supersede resend.
        if (busy.current) return;
        busy.current = true;
        setPending("status");
        setResendRecoveries((count) => count + 1);
        try {
          await recover();
        } finally {
          busy.current = false;
          if (mounted.current) setPending(null);
        }
      },
      1000 * 2 ** resendRecoveries,
    );
    return () => clearTimeout(timer);
  }, [challenge.status, pending, recover, verified, resendRecoveries]);
  useEffect(() => {
    if (!verified || !mounted.current) return;
    clearRegistration();
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // A bounded success transition, never a timeout/reload workaround for navigation.
    const timer = setTimeout(
      () => router.replace("/account"),
      reduced ? 0 : 220,
    );
    return () => clearTimeout(timer);
  }, [verified, router]);
  const expired =
    challenge.expiresAt <= now || feedback.errorCode === "OTP_EXPIRED";
  const locked =
    challenge.status === "locked" ||
    feedback.errorCode === "OTP_ATTEMPTS_EXHAUSTED";
  const sending = challenge.status === "sending";
  const blocked = Boolean(pending || verified || expired || locked || sending);
  useEffect(() => {
    if (!/^[0-9]{6}$/.test(code) || blocked || autoSubmitted.current === code)
      return;
    autoSubmitted.current = code;
    form.current?.requestSubmit();
  }, [code, blocked]);
  const changeCode = (value: string) => {
    setCode(value);
    if (value.length < 6) autoSubmitted.current = "";
    if (feedback.errorCode === "OTP_INVALID") setFeedback({});
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || blocked || !/^[0-9]{6}$/.test(code)) return;
    busy.current = true;
    setPending("verify");
    setFeedback({});
    autoSubmitted.current = code;
    try {
      const data = new FormData(event.currentTarget);
      const result = await verifyRegistrationAction(undefined, data);
      if (!mounted.current) return;
      if (result.ok && "verified" in result && result.verified === true) {
        setFeedback({ message: "Email berhasil diverifikasi." });
        setVerified(true);
      } else {
        setFeedback(result);
        if (
          result.errorCode === "CHALLENGE_MISSING" ||
          result.errorCode === "REGISTRATION_CONFLICT"
        )
          onRestart(result.error, result.errorCode);
        else
          requestAnimationFrame(() => {
            input.current?.focus();
            input.current?.select();
          });
      }
    } catch {
      if (!mounted.current) return;
      setFeedback({
        error:
          "Respons verifikasi belum diterima. Periksa koneksi dan coba lagi.",
      });
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || verified) return;
    busy.current = true;
    setPending("resend");
    setFeedback({});
    try {
      const data = new FormData(event.currentTarget);
      const result = await timedRegistration(() =>
        resendRegistrationAction(undefined, data),
      );
      if (!mounted.current) return;
      if (result.ok && adopt(result)) {
        setCode("");
        autoSubmitted.current = "";
        setResendRecoveries(0);
        setFeedback({ message: "Kode OTP baru telah dikirim ke email Anda." });
        requestAnimationFrame(() => input.current?.focus());
      } else {
        setFeedback(result);
        if (
          [
            "CHALLENGE_MISSING",
            "OTP_DELIVERY_FAILED",
            "REGISTRATION_CONFLICT",
          ].includes(result.errorCode || "")
        )
          onRestart(
            result.errorCode === "OTP_DELIVERY_FAILED"
              ? "Pengiriman ulang OTP gagal. Silakan minta kode baru."
              : result.error,
            result.errorCode,
          );
      }
    } catch {
      if (!mounted.current) return;
      // Never invent another ten minutes after a lost response. Reconcile server metadata.
      setCode("");
      autoSubmitted.current = "";
      setFeedback({
        error: "Respons pengiriman belum diterima. Memeriksa status kode...",
      });
      await recover();
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const visualState = verified
    ? "success"
    : pending === "verify"
      ? "verifying"
      : feedback.errorCode?.startsWith("OTP_") &&
          feedback.errorCode !== "OTP_SENDING"
        ? "error"
        : "idle";
  const cooldown = Math.max(
    0,
    Math.ceil((challenge.resendAvailableAt - now) / 1000),
  );
  return (
    <div className="auth-content">
      <div className="auth-heading">
        <h1>Verifikasi email</h1>
        <p>
          Masukkan kode 6 angka yang dikirim ke{" "}
          <strong>{challenge.email}</strong>.
        </p>
      </div>
      <form
        ref={form}
        onSubmit={submit}
        className="auth-form auth-otp-form"
        data-testid="verify-registration-form"
        aria-busy={pending === "verify"}
      >
        <input type="hidden" name="email" value={challenge.email} />
        <input type="hidden" name="challengeId" value={challenge.challengeId} />
        <OtpInput
          ref={input}
          value={code}
          onChange={changeCode}
          disabled={Boolean(pending || verified || sending)}
          state={visualState}
        />
        <p id="register-otp-note" className="auth-otp-note">
          Jangan bagikan kode ini. Isi otomatis tersedia jika didukung browser
          atau perangkat Anda.
        </p>
        <p
          id="otp-expiry"
          className="auth-otp-expiry"
          data-testid="otp-expiry"
          aria-live="off"
        >
          {expired ? "Kode kedaluwarsa" : "Kode berlaku"}{" "}
          <time>{formatOtpTime(challenge.expiresAt - now)}</time>
        </p>
        <div
          className="auth-otp-feedback"
          id="verify-registration-error"
          aria-live="polite"
          aria-atomic="true"
        >
          {verified ? (
            <p className="auth-success" role="status">
              Email berhasil diverifikasi.
            </p>
          ) : feedback.error ? (
            <p role="alert" data-testid="verify-registration-error">
              {feedback.error}
            </p>
          ) : expired ? (
            <p role="alert">
              Kode OTP sudah kedaluwarsa. Silakan kirim ulang kode.
            </p>
          ) : locked ? (
            <p role="alert">
              Batas percobaan kode OTP tercapai. Silakan kirim ulang kode.
            </p>
          ) : sending ? (
            <p role="status">Kode OTP sedang dikirim...</p>
          ) : (
            <p role="status">
              {feedback.message ||
                "Kode OTP telah dikirim. Periksa email Anda."}
            </p>
          )}
        </div>
        <Button
          type="submit"
          className="auth-submit"
          data-testid="auth-submit"
          loading={pending === "verify"}
          disabled={blocked || code.length !== 6}
        >
          {pending === "verify"
            ? "Memverifikasi..."
            : verified
              ? "Email terverifikasi"
              : "Verifikasi & Buat Akun"}
        </Button>
      </form>
      <form onSubmit={resend} className="auth-resend-form">
        <input type="hidden" name="email" value={challenge.email} />
        <input type="hidden" name="challengeId" value={challenge.challengeId} />
        <button
          type="submit"
          className="auth-resend-button"
          data-testid="registration-resend"
          aria-busy={pending === "resend"}
          disabled={Boolean(pending || verified || cooldown > 0)}
        >
          {pending === "resend"
            ? "Mengirim..."
            : cooldown > 0
              ? `Kirim ulang dalam ${cooldown} detik`
              : "Kirim ulang kode"}
        </button>
      </form>
      <div className="auth-otp-secondary">
        {!verified && (
          <p className="auth-switch">
            <button
              type="button"
              className="auth-resend-button"
              disabled={Boolean(pending)}
              onClick={() => onRestart()}
            >
              Ubah data pendaftaran
            </button>
          </p>
        )}
        {!verified && (
          <p className="auth-otp-note">
            <button
              type="button"
              className="auth-resend-button"
              disabled={Boolean(pending)}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                setPending("status");
                try {
                  await recover();
                } finally {
                  busy.current = false;
                  if (mounted.current) setPending(null);
                }
              }}
            >
              Periksa status kode
            </button>
          </p>
        )}
        {verified && (
          <p className="auth-switch">
            <Link href="/account">Lanjut ke akun</Link>
          </p>
        )}
      </div>
    </div>
  );
}
