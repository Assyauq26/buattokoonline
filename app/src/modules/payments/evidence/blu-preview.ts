import { createHash } from "node:crypto";

/** Shared bounded content validation. Receiver digits are hashed, never returned.
 * This parses content, not sender authenticity or a bank transaction identity. */
export function readBluNotificationFields(message: {
  subject: string;
  text: string;
}) {
  if (message.text.length > 32_000 || message.subject.length > 200)
    throw new Error("Notifikasi terlalu besar");
  const text = message.text.replace(/\r\n/g, "\n").trim();
  if (
    /^(re|fw|fwd)\s*:/i.test(message.subject) ||
    /forwarded message|begin forwarded|pesan yang diteruskan/i.test(text)
  )
    throw new Error("Email diteruskan bukan sumber notifikasi asli");
  if (
    !/^Info Transaksi Masuk ke blu Kamu(?:\s|$)/u.test(message.subject) ||
    !text.includes(
      "Ada transaksi masuk ke rekening bluAccount kamu. Ini detailnya:",
    )
  )
    throw new Error("Format notifikasi blu belum dikenali");
  function field(pattern: RegExp, label: string) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1)
      throw new Error(`${label} blu ambigu atau belum lengkap`);
    return matches[0][1];
  }
  const amountText = field(
    /^Nominal Transfer\s*\nRp[ \t\u00a0]*(\d{1,3}(?:\.\d{3})*|\d+),00\s*$/gm,
    "Nominal",
  );
  const amount = Number(amountText.replaceAll(".", ""));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647)
    throw new Error("Nominal IDR blu tidak valid");
  const time = field(
    /^Tgl & Jam Transaksi\s*\n(\d{1,2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} WIB)\s*$/gm,
    "Waktu",
  );
  const parts =
    /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) WIB$/.exec(time)!;
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ].indexOf(parts[2]);
  const [day, year, hour, minute, second] = [
    parts[1],
    parts[3],
    parts[4],
    parts[5],
    parts[6],
  ].map(Number);
  if (
    month < 0 ||
    year < 2000 ||
    year > 2100 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new Error("Waktu blu tidak valid");
  const local = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (local.getUTCMonth() !== month || local.getUTCDate() !== day)
    throw new Error("Tanggal blu tidak valid");
  const account = field(
    /^bluAccount\s*\n([\d ]{8,34})\s*$/gm,
    "Rekening penerima",
  ).replaceAll(" ", "");
  if (!/^\d{8,34}$/.test(account))
    throw new Error("Rekening penerima blu tidak valid");
  const transferType = field(
    /^Tipe Transaksi\s*\n(BI-FAST)\s*$/gm,
    "Tipe transaksi",
  );
  return {
    bank: "blu by BCA Digital",
    amount,
    currency: "IDR",
    direction: "CREDIT",
    occurredAt: new Date(local.getTime() - 7 * 3600_000),
    recipientLast4: account.slice(-4),
    accountRef: createHash("sha256")
      .update(JSON.stringify(["IDR", account]))
      .digest("hex"),
    transferType,
  };
}

/** Legacy screenshot preview; never emits an Observation or a paid result. */
export function recognizeBluPreview(message: {
  subject: string;
  text: string;
}) {
  const f = readBluNotificationFields(message);
  return {
    bank: f.bank,
    amount: f.amount,
    currency: f.currency,
    direction: f.direction,
    occurredAt: f.occurredAt,
    recipientLast4: f.recipientLast4,
    transferType: f.transferType,
    trusted: false as const,
    bankTxId: null,
    status: "UNKNOWN" as const,
    reason: "SCREENSHOT_FORMAT_ONLY_NOT_PAYMENT_EVIDENCE" as const,
  };
}
