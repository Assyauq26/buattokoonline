"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { Button, Checkbox, Icon, Input, Label } from "./lumen";
import {
  loginAction,
  registerAction,
  forgotPasswordAction,
  resetPasswordAction,
  registrationStatusAction,
} from "@/modules/auth/auth.actions";

import { RegistrationOtpStep } from "./registration-otp-step";
import {
  asChallenge,
  clearRegistration,
  readRegistration,
  registrationFields,
  rememberRegistration,
  timedRegistration,
} from "./registration-state";
import {
  REGISTRATION_CONFLICT,
  type RegistrationChallenge,
  type RegistrationFailure,
} from "@/modules/auth/registration-contract";

type FormState = {
  ok: boolean;
  error?: string;
  message?: string;
  email?: string;
  challengeId?: string;
  step?: string;
  resendAvailableAt?: number;
  expiresAt?: number;
  serverNow?: number;
  status?: RegistrationChallenge["status"];
  errorCode?: RegistrationFailure;
};
const initialState: FormState = { ok: false };
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="auth-submit"
      loading={pending}
      disabled={pending}
      data-testid="auth-submit"
    >
      <span>{pending ? "Memproses..." : label}</span>
      {!pending && <Icon name="arrow-right" />}
    </Button>
  );
}
function Field({
  id,
  label,
  icon,
  password,
  ...props
}: ComponentPropsWithoutRef<"input"> & {
  id: string;
  label: string;
  icon: "user-round" | "mail" | "phone" | "lock-keyhole";
  password?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(String(props.defaultValue ?? ""));
  return (
    <div className="auth-field">
      <Label htmlFor={id} className="auth-sr-only">
        {label}
      </Label>
      <div className="auth-input-wrap">
        <Icon name={icon} />
        <Input
          {...props}
          id={id}
          type={password ? (visible ? "text" : "password") : props.type}
          placeholder={props.placeholder || label}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            props.onChange?.(event);
          }}
          className={password ? "auth-input auth-input-password" : "auth-input"}
        />
        {password && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="auth-password-toggle"
            aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? "eye-off" : "eye"} />
          </Button>
        )}
      </div>
    </div>
  );
}
function Feedback({ error, id }: { error?: string; id: string }) {
  return (
    <div
      id={id}
      className="auth-feedback"
      aria-live="polite"
      aria-atomic="true"
    >
      {error && (
        <p role="alert" data-testid={id}>
          {error}
        </p>
      )}
    </div>
  );
}
function SocialButtons() {
  return (
    <div className="auth-social-block">
      <div className="auth-divider">
        <span>atau</span>
      </div>
      <div className="auth-social">
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby="social-coming-soon"
          title="Segera hadir"
          data-testid="google-login"
        >
          Lanjut dengan Google
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby="social-coming-soon"
          title="Segera hadir"
          data-testid="whatsapp-login"
        >
          Lanjut dengan WhatsApp
        </Button>
      </div>
      <p className="auth-social-note" id="social-coming-soon">
        Google dan WhatsApp · Segera hadir
      </p>
    </div>
  );
}
function Heading({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-heading">
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
export function LoginForm({ redirectTo, passwordReset }: { redirectTo?: string; passwordReset?: boolean }) {
  const [state, action] = useFormState<FormState, FormData>(
    loginAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Masuk">Selamat datang kembali di toko ini.</Heading>
      <form
        action={action}
        className="auth-form"
        data-testid="login-form"
        aria-describedby="login-error"
      >
        {passwordReset && <p role="status" className="auth-success">Password berhasil diperbarui. Silakan masuk menggunakan password baru Anda.</p>}
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <Field
          id="login-identifier"
          label="Email atau No. HP"
          name="identifier"
          icon="user-round"
          required
          autoComplete="username"
          autoCapitalize="none"
          data-testid="login-identifier"
        />
        <Field
          id="login-password"
          label="Password"
          name="password"
          icon="lock-keyhole"
          password
          required
          autoComplete="current-password"
          data-testid="login-password"
        />
        <Link href={/^\/admin(?:[/?]|$)/.test(redirectTo ?? "") ? "/seller-password-reset" : "/forgot-password"} className="auth-forgot">
          Lupa password?
        </Link>
        <Feedback error={state?.error} id="login-error" />
        <Submit label="Masuk" />
      </form>
      <SocialButtons />
      <p className="auth-switch">
        Belum punya akun? <Link href="/register">Daftar</Link>
      </p>
    </div>
  );
}
export function RegisterForm() {
  const [attempt, setAttempt] = useState(0);
  const [restartReason, setRestartReason] = useState<string>();
  const [restartCode, setRestartCode] = useState<RegistrationFailure>();
  const onRestart = useCallback(
    (reason?: string, code?: RegistrationFailure) => {
      clearRegistration();
      setRestartReason(reason);
      setRestartCode(code);
      setAttempt((value) => value + 1);
    },
    [],
  );
  return (
    <RegistrationForm
      key={attempt}
      onRestart={onRestart}
      restartReason={restartReason}
      restartCode={restartCode}
    />
  );
}
function RegistrationForm({
  onRestart,
  restartReason,
  restartCode,
}: {
  onRestart: (reason?: string, code?: RegistrationFailure) => void;
  restartReason?: string;
  restartCode?: RegistrationFailure;
}) {
  const registerWithClock = useCallback(
    (_prev: FormState, formData: FormData) =>
      timedRegistration(() => registerAction(undefined, formData)),
    [],
  );
  const [state, action] = useFormState<FormState, FormData>(
    registerWithClock,
    initialState,
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [activeOtp, setActiveOtp] = useState<RegistrationChallenge | null>(
    null,
  );
  const [restoring, setRestoring] = useState(true);
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let cancelled = false;
    const saved = readRegistration();
    if (!saved) {
      setRestoring(false);
      return;
    }
    setRestoring(true);
    setRecoveryError(false);
    void (async () => {
      try {
        const result = await timedRegistration(() =>
          registrationStatusAction(undefined, registrationFields(saved)),
        );
        if (cancelled) return;
        const live = asChallenge(result);
        if (live) {
          setActiveOtp(live);
          rememberRegistration(live);
        } else if (
          result.errorCode === "CHALLENGE_MISSING" ||
          result.errorCode === "REGISTRATION_CONFLICT"
        ) {
          onRestart(result.error, result.errorCode);
          return;
        } else setRecoveryError(true);
      } catch {
        if (!cancelled) setRecoveryError(true);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onRestart, recoveryAttempt]);
  useEffect(() => {
    if (state.step !== "verify") return;
    const live = asChallenge(state);
    if (live) {
      rememberRegistration(live);
      setActiveOtp(live);
    }
  }, [state]);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // Native action resets must not erase input or explicit consent after rejection.
    const preserveInput = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveInput);
    return () => form.removeEventListener("reset", preserveInput);
  }, [state.step, restoring, activeOtp]);
  // A completed submission takes precedence over feedback from the previous challenge.
  const registrationError = state.error ?? restartReason;
  const registrationErrorCode = state.error ? state.errorCode : restartCode;
  const challenge =
    activeOtp || (state.step === "verify" ? asChallenge(state) : null);
  if (challenge)
    return <RegistrationOtpStep initial={challenge} onRestart={onRestart} />;
  if (restoring || recoveryError)
    return (
      <div className="auth-content">
        <Heading title="Verifikasi email">
          Memulihkan sesi pendaftaran Anda.
        </Heading>
        <p className="auth-otp-note" role="status">
          {restoring
            ? "Memeriksa status kode..."
            : "Status kode belum dapat diperiksa. Periksa koneksi dan coba lagi."}
        </p>
        {!restoring && (
          <p className="auth-switch">
            <button
              className="auth-resend-button"
              onClick={() => setRecoveryAttempt((n) => n + 1)}
            >
              Coba lagi
            </button>
          </p>
        )}
        <p className="auth-switch">
          <button className="auth-resend-button" onClick={() => onRestart()}>
            Ubah data pendaftaran
          </button>
        </p>
      </div>
    );
  return (
    <div className="auth-content">
      <Heading title="Daftar akun">
        Buat akun baru untuk mulai belanja di toko ini.
      </Heading>
      <form
        action={action}
        className="auth-form"
        data-testid="register-form"
        ref={formRef}
        aria-describedby="register-error"
      >
        <Field
          id="register-name"
          label="Nama lengkap"
          name="name"
          icon="user-round"
          required
          minLength={2}
          autoComplete="name"
          data-testid="register-name"
        />
        <Field
          id="register-email"
          label="Email"
          name="email"
          type="email"
          icon="mail"
          required
          autoComplete="email"
          autoCapitalize="none"
          data-testid="register-email"
        />
        <Field
          id="register-phone"
          label="Nomor HP (wajib)"
          name="phone"
          type="tel"
          icon="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          data-testid="register-phone"
        />
        <Field
          id="register-password"
          label="Password"
          name="password"
          icon="lock-keyhole"
          password
          required
          minLength={6}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
          data-testid="register-password"
        />
        <Field
          id="register-confirm-password"
          label="Konfirmasi password"
          name="confirmPassword"
          icon="lock-keyhole"
          password
          required
          minLength={6}
          autoComplete="new-password"
          onChange={(event) => setConfirm(event.target.value)}
          data-testid="register-confirm-password"
        />
        {confirm && password !== confirm && (
          <p className="auth-inline-error" role="status">
            Konfirmasi password tidak sama.
          </p>
        )}
        <div className="auth-terms">
          <Label htmlFor="register-terms" className="auth-terms-check">
            <Checkbox
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              id="register-terms"
              name="terms"
              value="1"
              required
              data-testid="register-terms"
            />
            <span className="auth-sr-only">
              Saya setuju dengan Syarat &amp; Ketentuan dan Kebijakan Privasi
            </span>
          </Label>
          <p>
            Saya setuju dengan{" "}
            <Link
              href="/syarat-ketentuan"
              target="_blank"
              rel="noopener noreferrer"
            >
              Syarat &amp; Ketentuan
            </Link>{" "}
            dan{" "}
            <Link
              href="/kebijakan-privasi"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kebijakan Privasi
            </Link>
            .
          </p>
        </div>
        <Feedback error={registrationError} id="register-error" />
        {(registrationErrorCode === "REGISTRATION_CONFLICT" ||
          registrationError === REGISTRATION_CONFLICT) && (
          <nav className="auth-conflict-links" aria-label="Pemulihan akun">
            <Link href="/login">Masuk</Link>
            <Link href="/forgot-password">Lupa password</Link>
          </nav>
        )}
        <Submit label="Daftar" />
      </form>
      <SocialButtons />
      <p className="auth-switch">
        Sudah punya akun? <Link href="/login">Masuk</Link>
      </p>
    </div>
  );
}
export function ForgotForm() {
  const [state, action] = useFormState<FormState, FormData>(
    forgotPasswordAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Lupa Password">
        Masukkan email untuk menerima tautan reset.
      </Heading>
      <form action={action} className="auth-form" data-testid="forgot-form">
        <Field
          id="forgot-email"
          label="Email"
          name="email"
          type="email"
          icon="mail"
          required
          autoComplete="email"
          data-testid="forgot-email"
        />
        {state?.message && (
          <p
            role="status"
            className="auth-success"
            data-testid="forgot-message"
          >
            {state.message}
          </p>
        )}
        <Feedback id="forgot-error" error={state?.error} />
        <Submit label="Kirim Tautan Reset" />
      </form>
      <p className="auth-switch">
        <Link href="/seller-password-reset">Lupa password dashboard seller?</Link><br />
        <Link href="/login">Kembali ke Masuk</Link>
      </p>
    </div>
  );
}
export function ResetForm({ token }: { token: string }) {
  const [state, action] = useFormState<FormState, FormData>(
    resetPasswordAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Atur Ulang Password">
        Buat password baru untuk akun Anda.
      </Heading>
      <form action={action} className="auth-form" data-testid="reset-form">
        <input type="hidden" name="token" value={token} />
        <Field
          id="reset-password"
          label="Password Baru"
          name="password"
          password
          icon="lock-keyhole"
          required
          minLength={6}
          autoComplete="new-password"
          data-testid="reset-password"
        />
        <Feedback id="reset-error" error={state?.error} />
        <Submit label="Simpan Password" />
      </form>
    </div>
  );
}
export function SellerPasswordResetForm() {
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [id, setId] = useState("");
  const [token, setToken] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { if (step !== "email") heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (step !== "otp") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);
  const remaining = Math.max(0, Math.ceil((sentAt + 300_000 - now) / 1000));
  const cooldown = Math.max(0, remaining - 240);
  const login = "/login?redirectTo=/admin";

  async function send(payload: Record<string, string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/seller-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Terjadi gangguan. Coba lagi nanti.");
        return;
      }
      if (payload.action === "request") {
        const time = Date.now();
        setId(result.id);
        setSentAt(time);
        setNow(time);
        setStep("otp");
      } else if (payload.action === "verify") {
        setToken(result.token);
        setStep("password");
      } else {
        setToken("");
        window.location.assign(login + "&passwordReset=success");
      }
    } catch {
      setError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const [local, domain] = email.split("@");
  return (
    <div className="auth-content" style={{ maxWidth: 440 }}>
      <div ref={heading} tabIndex={-1}>
        <Heading title={{ email: "Lupa Password?", otp: "Verifikasi Email", password: "Buat Password Baru" }[step]}>
          {step === "email" && "Masukkan email akun dashboard seller Anda."}
          {step === "otp" && `Jika email terdaftar, kode dikirim ke ${local?.slice(0, 1)}***@${domain}.`}
          {step === "password" && "Gunakan minimal 12 karakter. Anda bisa memakai frasa sandi."}
        </Heading>
      </div>
        <form key={step} className="auth-form" onSubmit={event => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          if (step === "email") void send({ action: "request", email });
          if (step === "otp" && remaining > 0) void send({ action: "verify", id, code: String(values.get("code")) });
          if (step === "password") {
            const password = String(values.get("password"));
            const confirmation = String(values.get("confirmation"));
            if (password !== confirmation || new TextEncoder().encode(password).length > 72) {
              setError(password !== confirmation ? "Konfirmasi password tidak cocok." : "Password maksimal 72 byte.");
              return;
            }
            void send({ action: "complete", token, password, confirmation });
          }
        }}>
          {step === "email" && <Field id="seller-reset-email" label="Email" type="email" icon="mail" required autoComplete="email" maxLength={254} defaultValue={email} onChange={event => setEmail(event.target.value)} />}
          {step === "otp" && <>
            <Field key={id} id="seller-reset-code" label="Kode OTP enam digit" name="code" icon="lock-keyhole" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
            <p>{remaining ? `Kode berlaku ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Kode kedaluwarsa. Kirim ulang untuk memperoleh kode baru."}</p>
          </>}
          {step === "password" && <>
            <Field id="seller-new-password" label="Password Baru" name="password" icon="lock-keyhole" password required minLength={12} maxLength={72} autoComplete="new-password" />
            <Field id="seller-confirm-password" label="Konfirmasi Password" name="confirmation" icon="lock-keyhole" password required minLength={12} maxLength={72} autoComplete="new-password" />
          </>}
          <Feedback id="seller-reset-error" error={error} />
          <Button type="submit" className="auth-submit" disabled={busy || (step === "otp" && remaining === 0)} loading={busy}>
            {busy ? "Memproses..." : step === "email" ? "Kirim Kode OTP" : step === "otp" ? "Verifikasi" : "Simpan Password"}
          </Button>
          {step === "otp" && <Button type="button" variant="ghost" disabled={busy || cooldown > 0} onClick={() => void send({ action: "request", email })}>
            {cooldown > 0 ? `Kirim ulang dalam ${cooldown} detik` : "Kirim Ulang Kode"}
          </Button>}
          {step !== "email" && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setToken(""); setError(""); setStep("email"); }}>
            Kembali ke email
          </Button>}
        </form>
      <p className="auth-switch"><Link href={login}>Kembali ke Masuk</Link></p>
    </div>
  );
}
