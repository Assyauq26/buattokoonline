import { z } from "zod";
const signatureAudit = z.object({
  format: z.literal(1), rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observationFingerprint: z.string().regex(/^[a-f0-9]{64}$/), verified: z.boolean(),
  code: z.enum(["BANK_DKIM_VALID", "SIGNATURE_INVALID", "SIGNATURE_MISSING", "HEADERS_UNSAFE", "MESSAGE_LIMIT", "DNS_UNAVAILABLE"]),
}).strict();
/** A prior passing signature must never authenticate changed/replaced evidence. */
export function signatureAuditState(evidence: { fingerprint: string; reason: string }, reason: string | undefined) {
  const fallback = { verified: false, retry: false };
  if (!reason || reason.length > 1024 || evidence.reason === "SOURCE_CHANGED_REQUIRES_REVIEW") return fallback;
  try {
    const parsed = signatureAudit.safeParse(JSON.parse(reason));
    if (!parsed.success || parsed.data.observationFingerprint !== evidence.fingerprint) return fallback;
    return { verified: parsed.data.verified && parsed.data.code === "BANK_DKIM_VALID", retry: parsed.data.code === "DNS_UNAVAILABLE" };
  } catch { return fallback; }
}
