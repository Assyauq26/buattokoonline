// @vitest-environment jsdom
import { createElement, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OtpInput } from "@/components/auth/otp-input";
import { RegistrationOtpStep } from "@/components/auth/registration-otp-step";
import {
  asChallenge,
  formatOtpTime,
  timedRegistration,
} from "@/components/auth/registration-state";
import type { RegistrationChallenge } from "@/modules/auth/registration-contract";
const mock = vi.hoisted(() => ({
  verify: vi.fn(),
  resend: vi.fn(),
  status: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/modules/auth/auth.actions", () => ({
  verifyRegistrationAction: mock.verify,
  resendRegistrationAction: mock.resend,
  registrationStatusAction: mock.status,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
}));
const challenge = (): RegistrationChallenge => ({
  email: "dummy@example.test",
  challengeId: "00000000-0000-4000-8000-000000000001",
  serverNow: Date.now(),
  expiresAt: Date.now() + 600_000,
  resendAvailableAt: Date.now() + 60_000,
  status: "active",
});
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(0), 0),
  );
  mock.verify.mockResolvedValue({
    ok: false,
    errorCode: "OTP_INVALID",
    error: "Kode OTP salah. Periksa kembali dan coba lagi.",
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});
function Entry() {
  const [value, setValue] = useState("");
  return createElement(OtpInput, { value, onChange: setValue, state: "idle" });
}
it("uses one native autofill input and six visual slots; numeric editing, paste and selection remain native", () => {
  render(createElement(Entry));
  const input = screen.getByLabelText("Kode OTP 6 angka") as HTMLInputElement;
  expect(
    screen.getByTestId("otp-slots").querySelectorAll(".auth-otp-slot"),
  ).toHaveLength(6);
  expect(input.autocomplete).toBe("one-time-code");
  expect(input.inputMode).toBe("numeric");
  fireEvent.change(input, { target: { value: "a12b3" } });
  expect(input.value).toBe("123");
  fireEvent.paste(input, { clipboardData: { getData: () => "1234567890" } });
  expect(input.value).toBe("123");
  fireEvent.paste(input, { clipboardData: { getData: () => "654 321" } });
  expect(input.value).toBe("654321");
  input.setSelectionRange(0, 6);
  fireEvent.change(input, { target: { value: "012345" } });
  expect(input.value).toBe("012345");
  expect(
    screen.getByTestId("otp-slots").querySelector(".auth-otp-slots")
      ?.textContent,
  ).toBe("012345");
});
it("autosubmits complete native input once, stays neutral while pending, and only turns green on backend success", async () => {
  let resolve!: (value: unknown) => void;
  mock.verify.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: vi.fn(),
    }),
  );
  const button = screen.getByTestId("auth-submit") as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "12345" },
  });
  expect(mock.verify).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() => expect(mock.verify).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
    "verifying",
  );
  expect(button.disabled).toBe(true);
  fireEvent.submit(screen.getByTestId("verify-registration-form"));
  expect(mock.verify).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: true, verified: true }));
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
    "success",
  );
  expect(screen.getByText("Email berhasil diverifikasi.")).toBeTruthy();
  await waitFor(() => expect(mock.replace).toHaveBeenCalledWith("/account"));
});
it("only a server rejection produces red/shake state and unchanged code does not auto-retry", async () => {
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: vi.fn(),
    }),
  );
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
      "error",
    ),
  );
  expect(mock.verify).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert").textContent).toContain("Kode OTP salah");
  expect(mock.replace).not.toHaveBeenCalled();
});
it("network failure never produces green and manual retry remains available", async () => {
  mock.verify.mockRejectedValue(new Error("dummy offline"));
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: vi.fn(),
    }),
  );
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Respons verifikasi belum diterima",
    ),
  );
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).toBe(
    "idle",
  );
  fireEvent.submit(screen.getByTestId("verify-registration-form"));
  await waitFor(() => expect(mock.verify).toHaveBeenCalledTimes(2));
  expect(mock.replace).not.toHaveBeenCalled();
});
it("expiry is formatted from server time and a lost resend response recovers the actual deadline", async () => {
  const live = {
    ...challenge(),
    resendAvailableAt: Date.now() - 1,
    expiresAt: Date.now() + 25_000,
  };
  mock.resend.mockRejectedValue(new Error("dummy lost response"));
  mock.status.mockResolvedValue({ ok: true, ...live });
  render(
    createElement(RegistrationOtpStep, { initial: live, onRestart: vi.fn() }),
  );
  expect(screen.getByTestId("otp-expiry").textContent).toContain("00:25");
  fireEvent.click(screen.getByTestId("registration-resend"));
  await waitFor(() => expect(mock.status).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("otp-expiry").textContent).toContain("00:25");
  expect(screen.getByTestId("otp-slots").getAttribute("data-state")).not.toBe(
    "success",
  );
  const raw = window.sessionStorage.getItem("store.registration.otp.v1")!;
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["challengeId", "email"]);
  expect(formatOtpTime(-1)).toBe("00:00");
});
it("a server-deleted generation restarts the form without silently creating another challenge", async () => {
  const restart = vi.fn();
  mock.verify.mockResolvedValue({
    ok: false,
    errorCode: "CHALLENGE_MISSING",
    error: "Sesi pendaftaran tidak tersedia.",
  });
  render(
    createElement(RegistrationOtpStep, {
      initial: challenge(),
      onRestart: restart,
    }),
  );
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  await waitFor(() =>
    expect(restart).toHaveBeenCalledWith(
      "Sesi pendaftaran tidak tersedia.",
      "CHALLENGE_MISSING",
    ),
  );
  expect(mock.resend).not.toHaveBeenCalled();
});

it("expired challenges cannot verify and resend resets the field using server metadata", async () => {
  const initial = {
    ...challenge(),
    status: "expired" as const,
    expiresAt: Date.now() - 1,
    resendAvailableAt: Date.now() - 1,
  };
  mock.resend.mockResolvedValue({ ok: true, ...challenge() });
  render(createElement(RegistrationOtpStep, { initial, onRestart: vi.fn() }));
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  expect(mock.verify).not.toHaveBeenCalled();
  expect(
    (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("kedaluwarsa");
  fireEvent.click(screen.getByTestId("registration-resend"));
  await waitFor(() =>
    expect((screen.getByTestId("register-otp") as HTMLInputElement).value).toBe(
      "",
    ),
  );
  expect(mock.verify).not.toHaveBeenCalled();
});

it("sending recovery retries after a transient status failure and stops when the server activates the code", async () => {
  vi.useFakeTimers();
  const initial = { ...challenge(), status: "sending" as const };
  mock.status
    .mockReset()
    .mockRejectedValueOnce(new Error("dummy disconnected"))
    .mockResolvedValue({ ok: true, ...initial, status: "active" });
  render(createElement(RegistrationOtpStep, { initial, onRestart: vi.fn() }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(mock.status).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
  ).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(mock.status).toHaveBeenCalledTimes(2);
  expect(
    (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
  ).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(mock.status).toHaveBeenCalledTimes(2);
  expect(mock.verify).not.toHaveBeenCalled();
  expect(mock.resend).not.toHaveBeenCalled();
});
it("sending recovery stops after four failures and retains an explicit manual status fallback", async () => {
  vi.useFakeTimers();
  mock.status.mockReset().mockRejectedValue(new Error("dummy offline"));
  render(
    createElement(RegistrationOtpStep, {
      initial: { ...challenge(), status: "sending" },
      onRestart: vi.fn(),
    }),
  );
  for (const delay of [1000, 2000, 4000, 8000]) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delay);
    });
  }
  expect(mock.status).toHaveBeenCalledTimes(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(mock.status).toHaveBeenCalledTimes(4);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Periksa status kode" }),
    );
  });
  expect(mock.status).toHaveBeenCalledTimes(5);
  expect(mock.verify).not.toHaveBeenCalled();
  expect(mock.resend).not.toHaveBeenCalled();
});

it("fresh sending metadata cannot restart the automatic four-check budget indefinitely", async () => {
  vi.useFakeTimers();
  const initial = { ...challenge(), status: "sending" as const };
  mock.status.mockReset().mockImplementation(async () => ({
    ok: true,
    ...initial,
    serverNow: Date.now(),
  }));
  render(createElement(RegistrationOtpStep, { initial, onRestart: vi.fn() }));
  for (const delay of [1000, 2000, 4000, 8000]) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delay);
    });
  }
  expect(mock.status).toHaveBeenCalledTimes(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(mock.status).toHaveBeenCalledTimes(4);
  expect(
    (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(mock.verify).not.toHaveBeenCalled();
  expect(mock.resend).not.toHaveBeenCalled();
});

it("a stranded sending reservation can resend after the server cooldown while verification remains blocked", async () => {
  const first = render(
    createElement(RegistrationOtpStep, {
      initial: { ...challenge(), status: "sending" },
      onRestart: vi.fn(),
    }),
  );
  expect(
    (screen.getByTestId("registration-resend") as HTMLButtonElement).disabled,
  ).toBe(true);
  first.unmount();
  const stranded = {
    ...challenge(),
    status: "sending" as const,
    resendAvailableAt: Date.now() - 1,
  };
  mock.resend.mockResolvedValue({ ok: true, ...challenge() });
  render(
    createElement(RegistrationOtpStep, {
      initial: stranded,
      onRestart: vi.fn(),
    }),
  );
  expect(
    (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByTestId("registration-resend") as HTMLButtonElement).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByTestId("registration-resend"));
  await waitFor(() => expect(mock.resend).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
    ).toBe(false),
  );
  expect(mock.verify).not.toHaveBeenCalled();
});

it("automatic status recovery serializes with resend so an old sending snapshot cannot overwrite activation", async () => {
  vi.useFakeTimers();
  const initial = {
    ...challenge(),
    status: "sending" as const,
    resendAvailableAt: Date.now() - 1,
  };
  let release!: (value: unknown) => void;
  mock.status.mockReset().mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  mock.resend.mockResolvedValue({ ok: true, ...challenge() });
  render(createElement(RegistrationOtpStep, { initial, onRestart: vi.fn() }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(mock.status).toHaveBeenCalledTimes(1);
  const resendButton = screen.getByTestId(
    "registration-resend",
  ) as HTMLButtonElement;
  expect(resendButton.disabled).toBe(true);
  await act(async () => {
    fireEvent.submit(resendButton.closest("form")!);
  });
  expect(mock.resend).not.toHaveBeenCalled();
  expect(mock.verify).not.toHaveBeenCalled();
  await act(async () => {
    release({ ok: true, ...initial, serverNow: Date.now() });
  });
  expect(resendButton.disabled).toBe(false);
  await act(async () => {
    fireEvent.click(resendButton);
  });
  expect(mock.resend).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
  ).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(mock.status).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByTestId("register-otp") as HTMLInputElement).disabled,
  ).toBe(false);
});

it.each(["active", "missing"] as const)(
  "an unmounted recovery cannot replace a newer registration or restart it (%s)",
  async (outcome) => {
    vi.useFakeTimers();
    const initial = { ...challenge(), status: "sending" as const };
    let release!: (value: unknown) => void;
    mock.status.mockReset().mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const restart = vi.fn();
    const view = render(
      createElement(RegistrationOtpStep, { initial, onRestart: restart }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mock.status).toHaveBeenCalledTimes(1);
    view.unmount();
    const next = {
      email: "new-account@example.test",
      challengeId: "00000000-0000-4000-8000-000000000002",
    };
    sessionStorage.setItem(
      "store.registration.otp.v1",
      JSON.stringify(next),
    );
    await act(async () => {
      release(
        outcome === "active"
          ? { ok: true, ...initial, status: "active" }
          : {
              ok: false,
              errorCode: "CHALLENGE_MISSING",
              error: "Sesi pendaftaran tidak tersedia.",
            },
      );
    });
    expect(
      JSON.parse(sessionStorage.getItem("store.registration.otp.v1")!),
    ).toEqual(next);
    expect(restart).not.toHaveBeenCalled();
    expect(mock.replace).not.toHaveBeenCalled();
  },
);
it("a resend response arriving after navigation cannot overwrite another account's challenge", async () => {
  let release!: (value: unknown) => void;
  mock.resend.mockReset().mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const restart = vi.fn();
  const view = render(
    createElement(RegistrationOtpStep, {
      initial: { ...challenge(), resendAvailableAt: Date.now() - 1 },
      onRestart: restart,
    }),
  );
  fireEvent.click(screen.getByTestId("registration-resend"));
  await waitFor(() => expect(mock.resend).toHaveBeenCalledTimes(1));
  view.unmount();
  const next = {
    email: "other-account@example.test",
    challengeId: "00000000-0000-4000-8000-000000000002",
  };
  sessionStorage.setItem("store.registration.otp.v1", JSON.stringify(next));
  await act(async () => {
    release({ ok: true, ...challenge() });
  });
  expect(
    JSON.parse(sessionStorage.getItem("store.registration.otp.v1")!),
  ).toEqual(next);
  expect(restart).not.toHaveBeenCalled();
});

it("delayed resend accounts for transport time without counting provider processing twice or trusting the device wall clock", async () => {
  vi.useFakeTimers();
  const sent = Date.now();
  const serverReceivedAt = sent + 7200000;
  let release!: (value: unknown) => void;
  mock.resend.mockReset().mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  render(
    createElement(RegistrationOtpStep, {
      initial: { ...challenge(), resendAvailableAt: sent - 1 },
      onRestart: vi.fn(),
    }),
  );
  fireEvent.click(screen.getByTestId("registration-resend"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  await act(async () => {
    release({
      ok: true,
      ...challenge(),
      serverReceivedAt,
      serverNow: serverReceivedAt + 8000,
      expiresAt: serverReceivedAt + 608_000,
      resendAvailableAt: serverReceivedAt + 60_000,
    });
  });
  expect(screen.getByTestId("otp-expiry").textContent).toContain("09:59");
  expect(screen.getByTestId("registration-resend").textContent).toContain(
    "51 detik",
  );
  vi.setSystemTime(Date.now() + 86400000);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByTestId("otp-expiry").textContent).toContain("09:58");
  expect(mock.verify).not.toHaveBeenCalled();
});

it("a calibrated response keeps elapsed time before React mounts and never rewrites database deadlines", async () => {
  vi.useFakeTimers();
  const received = Date.now() + 3600000;
  const metadata = {
    ...challenge(),
    serverReceivedAt: received,
    serverNow: received + 1000,
    expiresAt: received + 3000,
    resendAvailableAt: received + 2000,
  };
  let release!: (value: typeof metadata) => void;
  const response = timedRegistration(
    () =>
      new Promise<typeof metadata>((resolve) => {
        release = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(4000);
  release(metadata);
  const observed = await response;
  expect(observed.expiresAt).toBe(metadata.expiresAt);
  expect(observed.resendAvailableAt).toBe(metadata.resendAvailableAt);
  expect(observed.serverNow).toBe(metadata.serverNow);
  await vi.advanceTimersByTimeAsync(3000);
  render(
    createElement(RegistrationOtpStep, {
      initial: asChallenge(observed)!,
      onRestart: vi.fn(),
    }),
  );
  expect(screen.getByTestId("otp-expiry").textContent).toContain("00:00");
  expect(
    (screen.getByTestId("registration-resend") as HTMLButtonElement).disabled,
  ).toBe(false);
  fireEvent.change(screen.getByTestId("register-otp"), {
    target: { value: "123456" },
  });
  expect(
    (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(mock.verify).not.toHaveBeenCalled();
});
