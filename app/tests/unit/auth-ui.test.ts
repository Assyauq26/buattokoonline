// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const form = vi.hoisted(() => ({
  pending: false,
  state: { ok: false } as {
    expiresAt?: number;
    serverNow?: number;
    status?: "active" | "expired" | "locked" | "sending";
    errorCode?:
      | "REGISTRATION_CONFLICT"
      | "TOO_MANY_REQUESTS"
      | "OTP_DELIVERY_FAILED";
    ok: boolean;
    error?: string;
    email?: string;
    step?: string;
    challengeId?: string;
    resendAvailableAt?: number;
  },
  resendFn: vi.fn(),
  verifyFn: vi.fn(),
  statusFn: vi.fn(),
  replace: vi.fn(),
  resend: { ok: false, restartRequired: false } as {
    ok: boolean;
    error?: string;
    resendAvailableAt?: number;
    restartRequired?: boolean;
  },
}));
vi.mock("react-dom", async (original) => ({
  ...(await original<typeof import("react-dom")>()),
  useFormState: (action: unknown) => [
    action === form.resendFn ? form.resend : form.state,
    undefined,
  ],
  useFormStatus: () => ({ pending: form.pending }),
}));
vi.mock("@/modules/auth/auth.actions", () => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  verifyRegistrationAction: form.verifyFn,
  registrationStatusAction: form.statusFn,
  resendRegistrationAction: form.resendFn,
  forgotPasswordAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: form.replace }),
}));
import { LoginForm, RegisterForm } from "@/components/auth/auth-forms";
afterEach(() => {
  cleanup();
  form.pending = false;
  form.state = { ok: false, error: undefined };
  form.resend = { ok: false, restartRequired: false };
  window.sessionStorage.clear();
  vi.clearAllMocks();
});
it("password toggle preserves entered credentials and remains a non-submit control", () => {
  render(createElement(LoginForm, { redirectTo: "/cart" }));
  const input = screen.getByLabelText("Password") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "local-test-password" } });
  const toggle = screen.getByRole("button", { name: "Tampilkan password" });
  expect(toggle.getAttribute("type")).toBe("button");
  fireEvent.click(toggle);
  expect(input.type).toBe("text");
  expect(input.value).toBe("local-test-password");
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(
    document.querySelector<HTMLInputElement>('[name="redirectTo"]')?.value,
  ).toBe("/cart");
  fireEvent.click(toggle);
  expect(input.type).toBe("password");
});
it("legal links open separately and do not implicitly consent or discard the form", () => {
  render(createElement(RegisterForm));
  expect(screen.getByTestId("auth-submit").textContent).toContain("Daftar");
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  fireEvent.change(email, { target: { value: "dummy@example.test" } });
  const terms = screen.getByTestId("register-terms") as HTMLInputElement;
  for (const name of ["Syarat & Ketentuan", "Kebijakan Privasi"]) {
    const link = screen.getByRole("link", { name });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.closest("label")).toBeNull();
  }
  expect(terms.checked).toBe(false);
  expect(terms.required).toBe(true);
  expect(email.required).toBe(true);
  expect(email.value).toBe("dummy@example.test");
  expect(
    (screen.getByTestId("register-phone") as HTMLInputElement).required,
  ).toBe(true);
  expect(
    (screen.getByTestId("register-confirm-password") as HTMLInputElement)
      .required,
  ).toBe(true);
});
it("pending submit is disabled and server errors are exposed to assistive technology", () => {
  form.pending = true;
  form.state.error = "Email atau password salah";
  render(createElement(LoginForm));
  expect(
    (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByTestId("auth-submit").getAttribute("aria-busy")).toBe(
    "true",
  );
  expect(screen.getByRole("alert").textContent).toBe(form.state.error);
  expect(
    (screen.getByTestId("google-login") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByTestId("whatsapp-login") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText(/Segera hadir/)).toBeTruthy();
});

it("registration retains typed values and explicit consent when an action requests native form reset", () => {
  render(createElement(RegisterForm));
  expect(screen.getByTestId("auth-submit").textContent).toContain("Daftar");
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  fireEvent.change(email, { target: { value: "dummy@example.test" } });
  const terms = screen.getByTestId("register-terms") as HTMLInputElement;
  fireEvent.click(terms);
  expect(terms.checked).toBe(true);
  (screen.getByTestId("register-form") as HTMLFormElement).reset();
  expect(terms.checked).toBe(true);
  expect(email.value).toBe("dummy@example.test");
});

it("OTP verification and resend carry the initiating generation without resubmitting credentials", () => {
  const challengeId = "00000000-0000-4000-8000-000000000001";
  form.state = {
    ok: true,
    step: "verify",
    email: "dummy@example.test",
    challengeId,
    resendAvailableAt: Date.now() + 60_000,
    expiresAt: Date.now() + 600_000,
    serverNow: Date.now(),
    status: "active",
  };
  render(createElement(RegisterForm));
  const fields = document.querySelectorAll<HTMLInputElement>(
    'input[name="challengeId"]',
  );
  expect(fields.length).toBe(2);
  expect(Array.from(fields).every((field) => field.value === challengeId)).toBe(
    true,
  );
  expect(screen.queryByTestId("register-password")).toBeNull();
  expect(
    (screen.getByTestId("registration-resend") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByTestId("register-otp").getAttribute("autocomplete")).toBe(
    "one-time-code",
  );
});

it("registration OTP survives reload using session-only challenge metadata, never passwords or OTP codes", async () => {
  const challengeId = "00000000-0000-4000-8000-000000000001";
  form.state = {
    ok: true,
    step: "verify",
    email: "reload@example.test",
    challengeId,
    resendAvailableAt: Date.now() + 60_000,
    expiresAt: Date.now() + 600_000,
    serverNow: Date.now(),
    status: "active",
  };
  const first = render(createElement(RegisterForm));
  await waitFor(() => {
    expect(
      JSON.parse(
        window.sessionStorage.getItem("store.registration.otp.v1") || "{}",
      ).challengeId,
    ).toBe(challengeId);
  });
  const raw =
    window.sessionStorage.getItem("store.registration.otp.v1") || "";
  expect(raw).not.toContain("password");
  expect(raw).not.toContain("otpCode");
  const recovered = { ...form.state, expiresAt: Date.now() + 20_000 };
  form.statusFn.mockResolvedValue(recovered);
  first.unmount();
  form.state = { ok: false };
  render(createElement(RegisterForm));
  await waitFor(() =>
    expect(screen.getByTestId("verify-registration-form")).toBeTruthy(),
  );
  const hidden = screen
    .getByTestId("verify-registration-form")
    .querySelector<HTMLInputElement>('input[name="challengeId"]');
  expect(hidden?.value).toBe(challengeId);
  expect(screen.queryByTestId("register-password")).toBeNull();
});

it("server-deleted OTP metadata is discarded and the registration form recovers", async () => {
  form.statusFn.mockResolvedValue({
    ok: false,
    error: "Sesi pendaftaran tidak tersedia.",
    errorCode: "CHALLENGE_MISSING",
  });
  window.sessionStorage.setItem(
    "store.registration.otp.v1",
    JSON.stringify({
      email: "expired@example.test",
      challengeId: "00000000-0000-4000-8000-000000000001",
      resendAvailableAt: 0,
      expiresAt: Date.now() - 1000,
    }),
  );
  render(createElement(RegisterForm));
  await waitFor(() =>
    expect(
      window.sessionStorage.getItem("store.registration.otp.v1"),
    ).toBeNull(),
  );
  expect(screen.getByTestId("register-form")).toBeTruthy();
});

it("a new action failure replaces stale restart feedback and obsolete conflict recovery links", async () => {
  form.statusFn.mockResolvedValue({
    ok: false,
    errorCode: "REGISTRATION_CONFLICT",
    error:
      "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.",
  });
  window.sessionStorage.setItem(
    "store.registration.otp.v1",
    JSON.stringify({
      email: "conflict@example.test",
      challengeId: "00000000-0000-4000-8000-000000000001",
    }),
  );
  const view = render(createElement(RegisterForm));
  await waitFor(() =>
    expect(
      screen.getByRole("navigation", { name: "Pemulihan akun" }),
    ).toBeTruthy(),
  );
  for (const [error, errorCode] of [
    ["Terlalu banyak percobaan. Coba lagi nanti.", "TOO_MANY_REQUESTS"],
    ["OTP tidak dapat dikirim. Coba lagi nanti.", "OTP_DELIVERY_FAILED"],
  ] as const) {
    form.state = { ok: false, error, errorCode };
    view.rerender(createElement(RegisterForm));
    expect(screen.getByTestId("register-error").textContent).toBe(error);
    expect(
      screen.queryByRole("navigation", { name: "Pemulihan akun" }),
    ).toBeNull();
  }
});
it("customer login only offers customer password recovery",()=>{
 render(createElement(LoginForm));
 expect(screen.getByRole("link",{name:"Lupa password?"}).getAttribute("href")).toBe("/forgot-password");
 expect(screen.queryByText("Lupa password akun seller?")).toBeNull();
});
it("seller login uses its own recovery context",()=>{
 render(createElement(LoginForm,{redirectTo:"/admin/orders"}));
 expect(screen.getByRole("heading",{name:"Masuk Seller"})).toBeTruthy();
 expect(screen.getByRole("link",{name:"Lupa password?"}).getAttribute("href")).toBe("/seller-password-reset");
});
