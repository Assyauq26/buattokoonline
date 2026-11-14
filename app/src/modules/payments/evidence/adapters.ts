import { z } from "zod";
import type { Observation } from "./policy";

/** No status fallback and no parseInt truncation. This is a fixture contract,
 * NOT confirmation that an unofficial merchant endpoint currently uses it. */
const mutation = z.object({
  id: z.string().min(1).max(256),
  merchant_id: z.string().min(1).max(256),
  gross_amount: z.union([
    z.number().int().nonnegative().max(2_147_483_647),
    z.string().regex(/^\d{1,10}$/),
  ]),
  transaction_status: z.string().min(1).max(80),
  transaction_time: z.iso.datetime({ offset: true }),
  currency: z.literal("IDR"),
  payment_type: z.literal("QRIS"),
});
export function normalizeGoPay(
  raw: unknown,
  expectedMerchant: string,
): Observation {
  const m = mutation.parse(raw),
    amount = Number(m.gross_amount);
  if (
    !Number.isSafeInteger(amount) ||
    amount > 2_147_483_647 ||
    m.merchant_id !== expectedMerchant
  )
    throw new Error("Mutasi merchant tidak sesuai");
  return {
    externalId: m.id,
    bankTxId: m.id,
    amount,
    currency: m.currency,
    status: m.transaction_status.toUpperCase(),
    direction: "CREDIT",
    occurredAt: new Date(m.transaction_time),
    accountRef: m.merchant_id,
    // Live merchant transport/login contract is unverified; normalization cannot
    // manufacture trustworthy provenance from a caller-supplied payload.
    trusted: false,
  };
}

/** Only explicitly synthetic notifications. There are NO production bank parsers.
 * From / Subject / Authentication-Results, including "dkim=pass", are not proof.
 * Production activation requires an independently validated delivery trust chain. */
export function parseSyntheticBank(message: {
  id: string;
  body: string;
  headers: ReadonlyArray<{ name: string; value: string }>;
}): Observation {
  if (message.body.length > 32_000 || message.id.length > 256 || !message.id)
    throw new Error("Pesan uji tidak valid");
  if (
    message.headers.some((h) =>
      /^(resent-|x-forwarded|forwarded)/i.test(h.name),
    ) ||
    /^\s*(fwd?:|forwarded message|begin forwarded)/im.test(message.body)
  )
    throw new Error("Email diteruskan tidak didukung");
  const match =
    /^HUBIFY SYNTHETIC BANK\nTX:([A-Za-z0-9_-]{1,100})\nACCOUNT:([A-Za-z0-9_-]{1,100})\nIDR:(\d{1,10})\nDIRECTION:(CREDIT|DEBIT)\nSTATUS:([A-Z_]{1,40})\nTIME:([^\n]{20,40})$/.exec(
      message.body,
    );
  if (!match || !z.iso.datetime({ offset: true }).safeParse(match[6]).success)
    throw new Error("Format bank belum didukung");
  const amount = Number(match[3]);
  if (amount > 2_147_483_647) throw new Error("Nominal tidak valid");
  return {
    externalId: `gmail:${message.id}`,
    bankTxId: match[1],
    messageId: message.id,
    accountRef: match[2],
    amount,
    currency: "IDR",
    direction: match[4],
    status: match[5],
    occurredAt: new Date(match[6]),
    trusted: false,
  };
}
export const SUPPORTED_PRODUCTION_BANKS: readonly string[] = [];
