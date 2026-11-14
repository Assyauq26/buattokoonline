import "server-only";
import { createHash } from "node:crypto";
import PostalMime, { type Email, type Header } from "postal-mime";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { readBluNotificationFields } from "./blu-preview";
import type { Observation } from "./policy";

export const MAX_BLU_EMAIL_BYTES = 128 * 1024;
const BANK_DOMAIN = "blubybcadigital.id";
type Fields = ReturnType<typeof readBluNotificationFields>;
type Node = DefaultTreeAdapterTypes.Node;
const blocks = new Set([
  "div",
  "p",
  "tr",
  "td",
  "table",
  "section",
  "li",
  "h1",
  "h2",
]);

/** Parse inert HTML, never render it, execute it or fetch embedded resources.
 * Keep inline spans together: the observed amount is Rp + nested digits + ,00.
 * Bound both input and DOM traversal; ignore hidden marketing/preheader content. */
export function bluHtmlText(html: string): string {
  if (Buffer.byteLength(html, "utf8") > MAX_BLU_EMAIL_BYTES)
    throw new Error("HTML blu terlalu besar");
  const document = parse(html, { scriptingEnabled: false });
  const chunks: string[] = [];
  let visited = 0;
  function visit(node: Node, depth: number) {
    if (++visited > 12000 || depth > 64)
      throw new Error("Struktur HTML blu terlalu rumit");
    if (node.nodeName === "#text") {
      // Source indentation/newlines inside inline spans are visual spaces in HTML.
      chunks.push(
        (node as DefaultTreeAdapterTypes.TextNode).value.replace(/\s+/g, " "),
      );
      return;
    }
    if ("tagName" in node) {
      const tag = node.tagName;
      if (
        [
          "head",
          "script",
          "style",
          "template",
          "noscript",
          "svg",
          "iframe",
          "object",
        ].includes(tag)
      )
        return;
      const attrs = new Map(
        node.attrs.map((a) => [a.name.toLowerCase(), a.value.toLowerCase()]),
      );
      if (
        attrs.has("hidden") ||
        attrs.get("aria-hidden") === "true" ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)/i.test(
          attrs.get("style") || "",
        )
      )
        return;
      if (tag === "br") chunks.push("\n");
      if (blocks.has(tag)) chunks.push("\n");
    }
    if ("childNodes" in node)
      for (const child of node.childNodes) visit(child, depth + 1);
    if ("tagName" in node && blocks.has(node.tagName)) chunks.push("\n");
  }
  visit(document, 0);
  return chunks
    .join("")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t \u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function sha(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
const AUTH_RESULTS = new Set([
  "pass",
  "fail",
  "softfail",
  "neutral",
  "none",
  "temperror",
  "permerror",
]);
/** Header claims are diagnostics ONLY. Even mx.google.com strings are forgeable
 * in uploaded/imported raw messages. No API parameter may promote them to trust. */
function authClaims(headers: Header[]) {
  const rows = headers.filter((h) => h.key === "authentication-results");
  const claims: Record<"spf" | "dkim" | "dmarc", string[]> = {
    spf: [],
    dkim: [],
    dmarc: [],
  };
  for (const row of rows)
    for (const match of row.value.matchAll(
      /(?:^|[;\s])(spf|dkim|dmarc)\s*=\s*([a-z]+)/gi,
    )) {
      const method = match[1].toLowerCase() as keyof typeof claims,
        value = match[2].toLowerCase();
      claims[method].push(AUTH_RESULTS.has(value) ? value : "unknown");
    }
  return {
    authenticationResultsCount: rows.length,
    claims,
    googleAuthservClaimed: rows.some((h) =>
      /^mx\.google\.com\s*;/i.test(h.value),
    ),
    independentlyVerified: false as const,
  };
}

function closedRootMultipart(raw: Uint8Array, contentType: string) {
  if (!/^multipart\//i.test(contentType)) return true;
  const boundary =
    /\bboundary\s*=\s*(?:"([^"\r\n]{1,70})"|([^;\s]{1,70}))/i.exec(contentType);
  const value = boundary?.[1] || boundary?.[2];
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\r?\\n)--${escaped}--[ \\t]*(?:\\r?\\n|$)`).test(
    Buffer.from(raw).toString("latin1"),
  );
}

export interface BluEmailReview {
  disposition: "REVIEW_REQUIRED";
  observation: Observation;
  reasons: string[];
  authentication: ReturnType<typeof authClaims>;
  format: "HTML" | "TEXT" | "HTML_AND_TEXT" | "UNKNOWN";
  bankReferenceAvailable: false;
  rfcMessageIdAvailable: boolean;
  threadContextPresent: boolean;
}

/** Review-only normalization of untrusted RFC5322 bytes. Original RFC Message-ID
 * deduplicates the email observation, NOT the money transfer. Missing bank IDs are
 * never manufactured from dates, amounts, senders or Gmail/RFC message IDs. */
export async function parseBluEmail(
  raw: Uint8Array,
  apiMessageId?: string,
): Promise<BluEmailReview> {
  if (raw.byteLength > MAX_BLU_EMAIL_BYTES || !raw.byteLength)
    throw new Error("Ukuran email blu tidak valid");
  if (
    apiMessageId !== undefined &&
    !/^[A-Za-z0-9_-]{1,256}$/.test(apiMessageId)
  )
    throw new Error("Identitas pesan Gmail tidak valid");
  let mail: Email;
  try {
    mail = await PostalMime.parse(raw, {
      maxHeadersSize: 32 * 1024,
      maxNestingDepth: 8,
      maxPartCount: 24,
      maxRfc822NestingDepth: 0,
      maxForwardedAddresses: 16,
      forceRfc822Attachments: true,
    });
  } catch {
    return review(undefined, ["MIME_INVALID_OR_LIMIT"], raw, apiMessageId);
  }
  const reasons: string[] = [];
  for (const key of ["from", "subject", "message-id", "content-type"]) {
    if (mail.headers.filter((h) => h.key === key).length > 1)
      reasons.push("DUPLICATE_CRITICAL_HEADER");
  }
  if (mail.from?.address?.split("@").at(-1)?.toLowerCase() !== BANK_DOMAIN)
    reasons.push("UNEXPECTED_SENDER_DOMAIN");
  if (
    /^(?:re|fw|fwd)\s*:/i.test(mail.subject || "") ||
    mail.headers.some((h) =>
      /^(?:resent-|x-forwarded-for$|x-forwarded-to$)/i.test(h.key),
    )
  )
    reasons.push("FORWARDED_OR_RESENT");
  if (mail.attachments.length) reasons.push("ATTACHMENT_OR_NESTED_MESSAGE");
  const contentType =
    mail.headers.find((h) => h.key === "content-type")?.value || "";
  if (!closedRootMultipart(raw, contentType)) reasons.push("MIME_TRUNCATED");
  let fields: Fields | undefined;
  if (!reasons.length) {
    const alternatives: Fields[] = [];
    try {
      if (mail.html !== undefined)
        alternatives.push(
          readBluNotificationFields({
            subject: mail.subject || "",
            text: bluHtmlText(mail.html),
          }),
        );
      if (mail.text !== undefined)
        alternatives.push(
          readBluNotificationFields({
            subject: mail.subject || "",
            text: mail.text,
          }),
        );
      if (!alternatives.length) throw new Error("Body absent");
      fields = alternatives[0];
      if (
        alternatives.some(
          (f) =>
            f.amount !== fields!.amount ||
            f.accountRef !== fields!.accountRef ||
            +f.occurredAt !== +fields!.occurredAt ||
            f.transferType !== fields!.transferType,
        )
      ) {
        fields = undefined;
        reasons.push("MIME_ALTERNATIVES_CONFLICT");
      }
    } catch {
      fields = undefined;
      reasons.push("CONTENT_INCOMPLETE_AMBIGUOUS_OR_UNSUPPORTED");
    }
  }
  return review(mail, reasons, raw, apiMessageId, fields);
}

function review(
  mail: Email | undefined,
  reasons: string[],
  raw: Uint8Array,
  apiMessageId?: string,
  fields?: Fields,
): BluEmailReview {
  const originalId = mail?.messageId?.trim();
  const validId =
    !!originalId &&
    /^<[^<>\s@]{1,180}@[^<>\s@]{1,180}>$/.test(originalId) &&
    mail!.headers.filter((h) => h.key === "message-id").length === 1;
  const externalId = validId
    ? `rfc-message:${sha(originalId!)}`
    : `raw-message:${sha(raw)}`;
  return {
    disposition: "REVIEW_REQUIRED",
    reasons: [
      ...new Set([
        ...reasons,
        ...(!validId ? ["RFC_MESSAGE_ID_MISSING_OR_INVALID"] : []),
        "BANK_TRANSACTION_ID_UNAVAILABLE",
        "AUTH_PROVENANCE_UNVERIFIED",
      ]),
    ],
    observation: {
      externalId,
      messageId: apiMessageId,
      amount: fields?.amount ?? null,
      currency: fields ? "IDR" : "UNKNOWN",
      direction: fields ? "CREDIT" : "UNKNOWN",
      status: "UNKNOWN",
      accountRef: fields?.accountRef || "",
      occurredAt: fields?.occurredAt ?? null,
      trusted: false,
    },
    authentication: authClaims(mail?.headers || []),
    format:
      mail?.html !== undefined
        ? mail.text !== undefined
          ? "HTML_AND_TEXT"
          : "HTML"
        : mail?.text !== undefined
          ? "TEXT"
          : "UNKNOWN",
    bankReferenceAvailable: false,
    rfcMessageIdAvailable: validId,
    // References alone is threading metadata, not proof of forwarding or bank identity.
    threadContextPresent: !!(mail?.references || mail?.inReplyTo),
  };
}
