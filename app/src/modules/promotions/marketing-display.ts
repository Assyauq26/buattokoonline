/**
 * Pure display helpers for the Marketing dashboard.
 * All SSR output must use the same timestamp on server and during hydration.
 * Jakarta is the storefront's business timezone (UTC+07, no DST).
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1_000;

export function formatWibDate(value: string | number): string {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const wibIso = new Date(timestamp + WIB_OFFSET_MS).toISOString();
  return `${wibIso.slice(8, 10)}/${wibIso.slice(5, 7)}/${wibIso.slice(0, 4)} ${wibIso.slice(11, 16)} WIB`;
}

export function voucherStatusAt(voucher: {
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
}, nowMs: number): "Aktif" | "Terjadwal" | "Kedaluwarsa" | "Nonaktif" {
  if (!voucher.isActive) return "Nonaktif";
  if (voucher.expiresAt && Date.parse(voucher.expiresAt) <= nowMs) return "Kedaluwarsa";
  if (voucher.startsAt && Date.parse(voucher.startsAt) > nowMs) return "Terjadwal";
  return "Aktif";
}

export function scheduledFlashStatusAt(startsAt: string, endsAt: string, nowMs: number): "Terjadwal" | "Berlangsung" | "Berakhir" {
  if (Date.parse(startsAt) > nowMs) return "Terjadwal";
  if (Date.parse(endsAt) > nowMs) return "Berlangsung";
  return "Berakhir";
}
