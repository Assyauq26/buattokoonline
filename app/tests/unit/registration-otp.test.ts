import { afterEach, expect, it, vi } from "vitest";
import {
  registrationSchema,
  registrationVerificationSchema,
  registrationResendSchema,
} from "@/modules/auth/registration-schema";
import {
  compareRegistrationOtp,
  hashRegistrationOtp,
  normalizeRegistrationPhone,
} from "@/modules/auth/registration-otp";
import {
  registrationMailConfig,
  sendRegistrationOtpEmail,
} from "@/modules/auth/registration-otp-email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const generation = "00000000-0000-4000-8000-000000000001";
const valid = {
  name: "Dummy",
  email: " Dummy@Example.test ",
  phone: "081234567890",
  password: "dummy-only-password",
  confirmPassword: "dummy-only-password",
  terms: true,
};
it("shares the registration contract: required phone/confirmation/consent and normalized email", () => {
  expect(registrationSchema.parse(valid).email).toBe("dummy@example.test");
  for (const patch of [
    { phone: undefined },
    { confirmPassword: undefined },
    { terms: "1" },
    { confirmPassword: "wrong" },
    { password: "é".repeat(40), confirmPassword: "é".repeat(40) },
  ]) {
    expect(registrationSchema.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
  }
  expect(normalizeRegistrationPhone("0812-3456-7890")).toBe("+6281234567890");
  expect(() => normalizeRegistrationPhone("invalid")).toThrow();
});
it("keys OTP hashes to signing configuration, purpose and normalized email", () => {
  vi.stubEnv("JWT_SECRET", "dummy-key-for-registration-only");
  const digest = hashRegistrationOtp(
    "Dummy@Example.test",
    "012345",
    generation,
  );
  expect(
    compareRegistrationOtp("dummy@example.test", "012345", digest, generation),
  ).toBe(true);
  expect(
    compareRegistrationOtp("other@example.test", "012345", digest, generation),
  ).toBe(false);
  expect(
    compareRegistrationOtp(
      "dummy@example.test",
      "012345",
      "sending:reservation",
      generation,
    ),
  ).toBe(false);
  expect(
    compareRegistrationOtp(
      "dummy@example.test",
      "012345",
      digest,
      "other-generation",
    ),
  ).toBe(false);
  vi.stubEnv("JWT_SECRET", "");
  expect(() =>
    hashRegistrationOtp("dummy@example.test", "012345", generation),
  ).toThrow();
});
it("rejects an email sink on hosted/remote databases before any network request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("STORE_ISOLATED_TESTS", "1");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://unused@127.0.0.1/store_sprint1_test",
  );
  vi.stubEnv("REGISTRATION_OTP_TEST_SINK", "http://localhost:9876/emails");
  vi.stubEnv("VERCEL_ENV", "production");
  await expect(
    sendRegistrationOtpEmail("dummy@example.test", "012345", {
      key: "dummy",
      from: "dummy@example.test",
    }),
  ).rejects.toMatchObject({ status: 503 });
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("DATABASE_URL", "postgresql://unused@remote.invalid/database");
  await expect(
    sendRegistrationOtpEmail("dummy@example.test", "012345", {
      key: "dummy",
      from: "dummy@example.test",
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("fails closed without email configuration and on rejected provider responses", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect(() => registrationMailConfig()).toThrow();
  vi.stubEnv("REGISTRATION_OTP_TEST_SINK", "");
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    sendRegistrationOtpEmail("dummy@example.test", "012345", {
      key: "dummy",
      from: "dummy@example.test",
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
});

it("verification and resend require the initiating challenge, including valid email/code", () => {
  const data = {
    email: "dummy@example.test",
    otp: "012345",
    challengeId: generation,
  };
  expect(registrationVerificationSchema.safeParse(data).success).toBe(true);
  expect(registrationResendSchema.safeParse(data).success).toBe(true);
  for (const challengeId of [undefined, "", "not-a-challenge"]) {
    expect(
      registrationVerificationSchema.safeParse({ ...data, challengeId })
        .success,
    ).toBe(false);
    expect(
      registrationResendSchema.safeParse({ ...data, challengeId }).success,
    ).toBe(false);
  }
});
