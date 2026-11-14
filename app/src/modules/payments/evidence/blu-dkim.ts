import "server-only";
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { dkimVerify, type DNSResolver } from "mailauth";

const BANK = "blubybcadigital.id";
const REQUIRED = ["from", "date", "subject", "message-id", "mime-version", "content-type"];
const KEY_NAME = /^[a-z0-9_-]{1,63}(?:\.[a-z0-9_-]{1,63}){0,2}\._domainkey\.blubybcadigital\.id$/i;
export type BluSignatureCode = "BANK_DKIM_VALID" | "SIGNATURE_INVALID" | "SIGNATURE_MISSING" | "HEADERS_UNSAFE" | "MESSAGE_LIMIT" | "DNS_UNAVAILABLE";
export interface BluSignatureCheck {
  format: 1;
  rawSha256: string;
  verified: boolean;
  code: BluSignatureCode;
}

/** Verifies the original bank signature, never Authentication-Results strings.
 * DKIM authenticates signed content, NOT a transfer identity, balance or settlement.
 * No raw mail/header/address/key/provider error is returned or persisted. */
export async function verifyBluDkim(raw: Uint8Array, options: {
  resolveTxt?: (name: string) => Promise<string[][]>;
  now?: Date;
} = {}): Promise<BluSignatureCheck> {
  const hash = createHash("sha256").update(raw).digest("hex");
  const result = (code: BluSignatureCode): BluSignatureCheck => ({ format: 1, rawSha256: hash, verified: code === "BANK_DKIM_VALID", code });
  if (!raw.length || raw.length > 128 * 1024) return result("MESSAGE_LIMIT");
  const text = Buffer.from(raw).toString("latin1");
  const split = /\r?\n\r?\n/.exec(text);
  if (!split || split.index > 32768) return result("MESSAGE_LIMIT");
  const names = [...text.slice(0, split.index).matchAll(/^([a-z0-9-]+):/gim)].map(m => m[1].toLowerCase());
  if (REQUIRED.some(name => names.filter(n => n === name).length !== 1)) return result("HEADERS_UNSAFE");
  const signatures = names.filter(n => n === "dkim-signature").length;
  if (!signatures) return result("SIGNATURE_MISSING");
  if (signatures > 4 || names.length > 100) return result("MESSAGE_LIMIT");

  const resolver = new Resolver({ timeout: 1500, tries: 1 });
  const abort = new AbortController();
  let dnsUnavailable = false, lookups = 0;
  const timeout = setTimeout(() => { abort.abort(); resolver.cancel(); }, 6500);
  const lookup: DNSResolver = async (name, type) => {
    if (abort.signal.aborted || ++lookups > 4 || type !== "TXT" || name.length > 253 || !KEY_NAME.test(name)) throw new Error("Restricted DKIM lookup");
    let records: string[][];
    try {
      if (options.resolveTxt) records = await options.resolveTxt(name);
      else {
        try { records = await resolver.resolveTxt(name); }
        catch {
          // Only a public bank key name is sent to this fixed HTTPS DNS endpoint.
          // No email content, account, sender or message identifier leaves the app.
          const url = new URL("https://dns.google/resolve");
          url.search = new URLSearchParams({ name, type: "TXT" }).toString();
          const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3000)]) });
          if (!response.ok || Number(response.headers.get("content-length") || 0) > 16384) throw new Error("DNS unavailable");
          const reader = response.body?.getReader();
          if (!reader) throw new Error("DNS unavailable");
          const chunks: Uint8Array[] = []; let size = 0;
          try {
            while (true) {
              const part = await reader.read(); if (part.done) break;
              size += part.value.length;
              if (size > 16384) { await reader.cancel(); throw new Error("DNS limit"); }
              chunks.push(part.value);
            }
          } finally { reader.releaseLock(); }
          const body = Buffer.concat(chunks).toString("utf8");
          const data = JSON.parse(body) as { Status?: number; Answer?: { type: number; data: string }[] };
          if (data.Status !== 0 || !Array.isArray(data.Answer)) throw new Error("DNS unavailable");
          records = data.Answer.filter(a => a.type === 16 && typeof a.data === "string").map(a =>
            [...a.data.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(m => JSON.parse(m[0]) as string));
        }
      }
      if (!Array.isArray(records) || records.length > 8 || records.some(row => !Array.isArray(row) || row.some(s => typeof s !== "string")) || JSON.stringify(records).length > 8192) throw new Error("DNS limit");
      return records;
    } catch { dnsUnavailable = true; throw new Error("Bank DKIM key unavailable"); }
  };
  try {
    const verification = await Promise.race([
      dkimVerify(Buffer.from(raw), { resolver: lookup, strict: true, minBitLength: 2048, rejectRsaSha1: true, curTime: options.now || new Date() }),
      new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new Error("DKIM timeout")), { once: true })),
    ]);
    if (verification.fromFields !== 1 || verification.fromSyntax !== "valid" || verification.headerFrom.length !== 1 || verification.headerFrom[0].split("@").at(-1)?.toLowerCase() !== BANK) return result("HEADERS_UNSAFE");
    const valid = verification.results.some(signature => {
      const headers = new Set((signature.signingHeaders?.keys || "").split(":").map(name => name.trim().toLowerCase()));
      return signature.status.result === "pass" && signature.signingDomain?.toLowerCase() === BANK &&
        signature.algo === "rsa-sha256" && (signature.modulusLength || 0) >= 2048 &&
        signature.signatureTimeValid === true && signature.canonBodyLengthLimited === false && !signature.status.testing &&
        typeof signature.bodyHash === "string" && signature.bodyHash === signature.bodyHashExpecting && REQUIRED.every(name => headers.has(name));
    });
    return result(valid ? "BANK_DKIM_VALID" : dnsUnavailable ? "DNS_UNAVAILABLE" : "SIGNATURE_INVALID");
  } catch { return result("DNS_UNAVAILABLE"); }
  finally { clearTimeout(timeout); resolver.cancel(); }
}
