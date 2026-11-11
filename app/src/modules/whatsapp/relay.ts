import "server-only";
import { readFile } from "node:fs/promises";
import { HttpError } from "@/lib/response";

export function whatsappEnabled() {
  return process.env.STORE_WHATSAPP_AUTH_ENABLED === "1";
}
export function notificationsEnabled() {
  return process.env.STORE_WHATSAPP_NOTIFICATIONS_ENABLED === "1";
}
const paths = new Set([
  "auth/start",
  "auth/status",
  "auth/finish",
  "auth/exchange",
  "session/status",
  "session/connect",
  "session/disconnect",
  "session/qr",
  "notifications/consent",
  "notifications/event",
  "notifications/history",
  "notifications/retry",
  "notifications/preferences",
]);
// Only a scoped tenant credential is mounted. Never distribute OpenWA master keys.
export async function whatsappRelay<T>(
  path: string,
  input: object,
): Promise<T> {
  if (!paths.has(path) || process.env.STORE_WHATSAPP_ENABLED !== "1")
    throw new HttpError("WhatsApp belum tersedia untuk toko ini.", 503);
  try {
    const token = (await readFile("/run/store-whatsapp-token", "utf8")).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw Error("configuration");
    const response = await fetch(
      "https://buattokosendiri.web.id/api/platform/whatsapp/" + path,
      {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    const reader = response.body?.getReader();
    if (!reader) throw Error("empty");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 300 * 1024) {
          await reader.cancel();
          throw Error("large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!response.ok) {
      const messages: Record<string, string> = {
        cooldown: "Tunggu satu menit sebelum meminta kode baru.",
        rate_limited: "Terlalu banyak percobaan. Coba lagi nanti.",
        challenge_invalid: "Kode salah, sudah digunakan, atau kedaluwarsa.",
        central_disconnected:
          "WhatsApp sedang tidak tersedia. Gunakan email untuk masuk.",
        pilot_recipient_required:
          "Nomor ini belum termasuk dalam uji terbatas WhatsApp.",
        paired_number_mismatch:
          "Nomor yang dipasangkan berbeda dari nomor toko. Sambungan dihentikan.",
        session_not_provisioned:
          "Koneksi WhatsApp belum disiapkan untuk toko ini.",
        qr_unavailable: "Kode QR belum tersedia. Periksa status koneksi lagi.",
        retry_not_safe:
          "Pesan tidak dapat dicoba ulang karena sudah kedaluwarsa, berubah, atau hasil pengirimannya belum pasti.",
      };
      throw new HttpError(
        messages[data.error] ||
          "WhatsApp belum dapat memproses permintaan. Coba lagi nanti.",
        response.status === 429 ? 429 : 409,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      "WhatsApp tidak dapat dihubungi. Email tetap dapat digunakan.",
      503,
    );
  }
}
