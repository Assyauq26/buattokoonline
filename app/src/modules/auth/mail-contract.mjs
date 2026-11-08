export const OTP_ADDRESS = "otp@buattokosendiri.web.id";
export const SELLER_BRAND = "Buattokosendiri";
export const MAIL_PURPOSES = Object.freeze([
  "customer-registration", "customer-reset", "customer-changed", "seller-reset", "seller-changed", "customer-test",
]);

export function sanitizeMailBrand(value) {
  return String(value ?? "").normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N} .&'()-]/gu, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80).trim() || "Toko Online";
}

export function mailSender(brand) {
  return `${sanitizeMailBrand(brand)} <${OTP_ADDRESS}>`;
}

const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

/** Structured messages only. Untrusted installations cannot submit HTML, URLs or subjects. */
export function renderOtpMail({ purpose, to, value = "" }, store) {
  if (!MAIL_PURPOSES.includes(purpose) || typeof to !== "string" || to.length > 254 ||
      !/^[^\s<>,;@]+@[^\s<>,;@]+\.[^\s<>,;@]+$/.test(to))
    throw new Error("invalid_mail");
  const seller = purpose === "seller-reset" || purpose === "seller-changed";
  const brand = seller ? SELLER_BRAND : sanitizeMailBrand(store.brand);
  if (typeof value !== "string" ||
      (purpose === "customer-reset" ? !/^[a-f0-9]{64}$/.test(value) :
        purpose === "seller-reset" || purpose === "customer-registration" ? !/^\d{6}$/.test(value) : value !== ""))
    throw new Error("invalid_mail_value");
  const resetUrl = purpose === "customer-reset" ? new URL("/reset-password", store.origin) : null;
  if (resetUrl) resetUrl.searchParams.set("token", value);
  const templates = {
    "customer-registration": ["Kode verifikasi email", `Kode OTP pendaftaran: ${value}. Berlaku 10 menit, maksimal 5 percobaan.`],
    "customer-reset": ["Atur ulang password", "Gunakan tautan berikut untuk membuat password baru. Tautan berlaku satu jam."],
    "seller-reset": ["Kode Verifikasi Reset Password", `Kode reset password seller: ${value}. Berlaku lima menit.`],
    "seller-changed": ["Password seller telah berubah", "Password akun dashboard telah berubah. Jika Anda tidak melakukan perubahan ini, hubungi pengelola toko."],
    "customer-changed": ["Password akun telah berubah", "Password akun Anda telah berubah dan sesi sebelumnya telah dicabut. Jika Anda tidak melakukan perubahan ini, segera gunakan fitur lupa password atau hubungi pengelola toko."],
    "customer-test": ["Uji pengiriman Email & OTP", "Email ini mengonfirmasi bahwa layanan email toko menerima permintaan uji pengiriman."],
  };
  const [title, message] = templates[purpose];
  const footer = purpose === "customer-test" || purpose.endsWith("-changed") ? "" : "Jika Anda tidak meminta email ini, abaikan pesan ini.";
  const text = [brand, store.origin, message, resetUrl?.href, footer].filter(Boolean).join("\n\n");
  const html = `<main style="max-width:440px;margin:auto;padding:24px;background:#fff;color:#171717;font:16px system-ui"><h1>${escapeHtml(brand)}</h1><p>${escapeHtml(store.origin)}</p><p>${escapeHtml(message)}</p>${resetUrl ? `<p><a href="${escapeHtml(resetUrl.href)}">Buat password baru</a></p>` : ""}<p>${escapeHtml(footer)}</p></main>`;
  return { from: mailSender(brand), to: [to], subject: `${title} — ${brand}`, text, html };
}

export async function deliverResend(endpoint, key, message, idempotencyKey) {
  const response = await fetch(endpoint, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "buattokosendiri-mail/1.0",
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify(message), cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("provider_rejected");
  }
  const result = await response.json().catch(() => ({}));
  return typeof result.id === 'string' ? result.id : undefined;
}
