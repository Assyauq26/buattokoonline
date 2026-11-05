import { HttpError } from "@/lib/response";

export interface ResetMailConfig {
  key: string;
  from: string;
  baseUrl: string;
}

/** Fail closed: never claim that an email was sent without a working provider. */
export function resetMailConfig(): ResetMailConfig {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  const base = process.env.PASSWORD_RESET_BASE_URL?.trim();
  if (!key || !from || !base) throw new HttpError("Pengiriman email reset password belum tersedia.", 503);
  let url: URL;
  try { url = new URL(base); }
  catch { throw new HttpError("Konfigurasi tautan reset password tidak valid.", 503); }
  const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!loopback && url.protocol !== "https:") || (loopback && !["http:", "https:"].includes(url.protocol)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new HttpError("Konfigurasi tautan reset password tidak valid.", 503);
  }
  return { key, from, baseUrl: url.origin };
}

export async function sendPasswordResetEmail(email: string, token: string, config: ResetMailConfig): Promise<void> {
  const link = `${config.baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      "User-Agent": "store-password-reset/1.0",
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: "Atur ulang password toko",
      text: `Gunakan tautan berikut untuk membuat password baru (berlaku 1 jam): ${link}\nJika Anda tidak meminta reset, abaikan email ini.`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new HttpError("Layanan email tidak dapat mengirim tautan reset. Coba lagi nanti.", 503);
}
