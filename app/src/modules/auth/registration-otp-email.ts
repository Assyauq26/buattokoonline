import { HttpError } from "@/lib/response";

export function registrationMailConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  if (!key || !from)
    throw new HttpError("Pengiriman OTP email belum tersedia.", 503);
  return { key, from };
}

/** Test sink permitted only with an isolated localhost PostgreSQL database and never on Vercel. */
function deliveryEndpoint(): string {
  const sink = process.env.REGISTRATION_OTP_TEST_SINK;
  if (!sink) return "https://api.resend.com/emails";
  try {
    const db = new URL(process.env.DATABASE_URL || "");
    const url = new URL(sink);
    if (
      process.env.STORE_ISOLATED_TESTS === "1" &&
      !process.env.VERCEL_ENV &&
      ["localhost", "127.0.0.1"].includes(db.hostname) &&
      db.pathname === "/store_sprint1_test" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/emails" &&
      !url.username &&
      !url.password
    )
      return url.toString();
  } catch {
    /* refuse override */
  }
  throw new HttpError("Konfigurasi OTP pengujian tidak aman.", 503);
}

export async function sendRegistrationOtpEmail(
  email: string,
  code: string,
  config: ReturnType<typeof registrationMailConfig>,
): Promise<void> {
  const response = await fetch(deliveryEndpoint(), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.key,
      "Content-Type": "application/json",
      "User-Agent": "store-registration-otp/1.0",
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: "Kode verifikasi email toko",
      text:
        "Kode OTP pendaftaran toko: " +
        code +
        "\nBerlaku selama 10 menit, maksimal 5 percobaan. Jangan berikan kode ini kepada siapa pun. Jika Anda tidak mendaftar, abaikan email ini.",
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new HttpError("Pengiriman OTP gagal. Coba lagi nanti.", 503);
}
