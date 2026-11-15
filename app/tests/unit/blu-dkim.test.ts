import { generateKeyPairSync } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { Resolver } from "node:dns/promises";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { dkimSign } from "mailauth";
import { verifyBluDkim } from "@/modules/payments/evidence/blu-dkim";
import { signatureAuditState } from "@/modules/payments/evidence/signature-audit";
const now = new Date("2026-11-14T12:00:00Z");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pub = key.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const privateKey = key.privateKey.export({ type: "pkcs8", format: "pem" });
const message = Buffer.from([
  "From: Synthetic blu <fixture@blubybcadigital.id>", "Date: Sat, 14 Nov 2026 12:00:00 +0000",
  "To: fixture@example.test", "Subject: Synthetic bank test", "Message-ID: <synthetic-signature@example.test>",
  "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", "Synthetic signed body only.", "",
].join("\r\n"));
const lookup = async (name: string) => {
  expect(name).toBe("synthetic._domainkey.blubybcadigital.id");
  return [[`v=DKIM1; k=rsa; p=${pub}`]];
};
async function signed(options: { maxBodyLength?: number; headerList?: string[]; domain?: string; expires?: Date } = {}) {
  const signature = await dkimSign(message, { signTime: now, expires: options.expires,
    headerList: options.headerList || ["From", "Date", "Subject", "Message-ID", "MIME-Version", "Content-Type"],
    signatureData: [{ signingDomain: options.domain || "blubybcadigital.id", selector: "synthetic", privateKey, maxBodyLength: options.maxBodyLength }] });
  expect(signature.errors).toEqual([]);
  return Buffer.concat([Buffer.from(signature.signatures), message]);
}
it("cryptographically verifies the complete signed body and critical headers", async () => {
  const result = await verifyBluDkim(await signed(), { resolveTxt: lookup, now });
  expect(result).toMatchObject({ code: "BANK_DKIM_VALID", verified: true });
  expect(Object.keys(result).sort()).toEqual(["code", "format", "rawSha256", "verified"]);
});
it("rejects body/header tampering even with forged Authentication-Results", async () => {
  const raw = await signed();
  for (const changed of [Buffer.concat([raw, Buffer.from("altered\r\n")]),
    Buffer.from(raw.toString().replace("Subject: Synthetic bank test", "Subject: Changed subject"))])
    expect((await verifyBluDkim(changed, { resolveTxt: lookup, now })).verified).toBe(false);
  const forged = Buffer.concat([Buffer.from("Authentication-Results: mx.google.com; dkim=pass\r\n"), message]);
  expect((await verifyBluDkim(forged, { resolveTxt: lookup, now })).verified).toBe(false);
});
it("rejects partial-body signatures, missing signed critical headers and expired signatures", async () => {
  for (const raw of [await signed({ maxBodyLength: 5 }), await signed({ headerList: ["From", "Subject"] }),
    await signed({ expires: new Date(+now + 1000) })]) {
    expect((await verifyBluDkim(raw, { resolveTxt: lookup, now: new Date(+now + 2000) })).verified).toBe(false);
  }
});
it("does not look up attacker-controlled domains or accept duplicate critical headers", async () => {
  const resolveTxt = vi.fn(lookup);
  expect((await verifyBluDkim(await signed({ domain: "attacker.example" }), { resolveTxt, now })).verified).toBe(false);
  expect(resolveTxt).not.toHaveBeenCalled();
  expect((await verifyBluDkim(Buffer.concat([Buffer.from("Subject: Extra\r\n"), await signed()]), { resolveTxt, now })).code).toBe("HEADERS_UNSAFE");
});
it("fails closed on DNS outage and oversized or over-signed input", async () => {
  const result = await verifyBluDkim(await signed(), { resolveTxt: async () => { throw new Error("synthetic DNS failure"); }, now });
  expect(result).toMatchObject({ verified: false, code: "DNS_UNAVAILABLE" });
  expect((await verifyBluDkim(Buffer.alloc(128 * 1024 + 1))).code).toBe("MESSAGE_LIMIT");
  const many = Buffer.concat([Buffer.from("DKIM-Signature: x\r\n".repeat(5)), message]);
  expect((await verifyBluDkim(many)).code).toBe("MESSAGE_LIMIT");
});
it("uses a bounded fixed-host HTTPS fallback with only the public bank key name", async () => {
  vi.spyOn(Resolver.prototype, "resolveTxt").mockRejectedValue(new Error("Synthetic DNS outage"));
  const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data: JSON.stringify(`v=DKIM1; k=rsa; p=${pub}`) }] })));
  vi.stubGlobal("fetch", fetch);
  expect((await verifyBluDkim(await signed(), { now })).verified).toBe(true);
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.origin).toBe("https://dns.google"); expect(url.searchParams.get("name")).toBe("synthetic._domainkey.blubybcadigital.id");
});
it("rejects oversized streamed DNS responses", async () => {
  vi.spyOn(Resolver.prototype, "resolveTxt").mockRejectedValue(new Error("Synthetic DNS outage"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(16385))));
  expect((await verifyBluDkim(await signed(), { now })).verified).toBe(false);
});
it("binds persisted signature results to the current evidence fingerprint and never overrides changed evidence", () => {
  const fingerprint = "a".repeat(64), e = { fingerprint, reason: "MISSING_STABLE_TRANSACTION_ID" };
  const audit = { format: 1, rawSha256: "b".repeat(64), observationFingerprint: fingerprint, code: "BANK_DKIM_VALID", verified: true };
  expect(signatureAuditState(e, JSON.stringify(audit)).verified).toBe(true);
  for (const data of [{ ...audit, observationFingerprint: "c".repeat(64) }, { ...audit, code: "SIGNATURE_INVALID" }, { ...audit, verified: false }])
    expect(signatureAuditState(e, JSON.stringify(data)).verified).toBe(false);
  expect(signatureAuditState({ ...e, reason: "SOURCE_CHANGED_REQUIRES_REVIEW" }, JSON.stringify(audit)).verified).toBe(false);
  expect(signatureAuditState(e, "not-json").verified).toBe(false);
});
it.skipIf(!process.env.BLU_ORIGINAL_EML_PATH)("verifies the owner-provided original privately, with a tampered-body negative control", async () => {
  const raw = readFileSync(process.env.BLU_ORIGINAL_EML_PATH!);
  expect((await verifyBluDkim(raw)).verified).toBe(true);
  expect((await verifyBluDkim(Buffer.concat([raw, Buffer.from("\r\nSynthetic tamper control\r\n")]))).verified).toBe(false);
});
