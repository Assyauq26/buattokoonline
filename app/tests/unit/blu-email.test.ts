import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import PostalMime from "postal-mime";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  parseBluEmail,
  bluHtmlText,
  MAX_BLU_EMAIL_BYTES,
} from "@/modules/payments/evidence/blu-email";
import {
  evidenceReason,
  matchReason,
} from "@/modules/payments/evidence/policy";
import { getGmailRawMessage } from "@/modules/payments/evidence/google";
import { BLU_HTML, BLU_TEXT, syntheticBluEml } from "../fixtures/blu-email";

afterEach(() => vi.unstubAllGlobals());
it.each(["quoted-printable", "base64"] as const)(
  "decodes bounded mixed MIME with UTF-8 subject and nested amount spans (%s)",
  async (encoding) => {
    const result = await parseBluEmail(
      syntheticBluEml({ encoding }),
      "gmail_message_1",
    );
    expect(result.format).toBe("HTML");
    expect(result.observation).toMatchObject({
      amount: 125001,
      currency: "IDR",
      direction: "CREDIT",
      occurredAt: new Date("2026-11-14T03:20:30Z"),
      trusted: false,
      status: "UNKNOWN",
      accountRef: createHash("sha256")
        .update(JSON.stringify(["IDR", "000011112222"]))
        .digest("hex"),
    });
    expect(result.observation.bankTxId).toBeUndefined();
    expect(result.reasons).toEqual([
      "BANK_TRANSACTION_ID_UNAVAILABLE",
      "AUTH_PROVENANCE_UNVERIFIED",
    ]);
    expect(result.authentication.claims).toEqual({
      dkim: ["pass"],
      spf: ["pass"],
      dmarc: ["pass"],
    });
    expect(result.authentication.independentlyVerified).toBe(false);
    expect(result.rfcMessageIdAvailable).toBe(true);
    expect(
      evidenceReason(result.observation, result.observation.accountRef),
    ).toBe("MISSING_STABLE_TRANSACTION_ID");
  },
);
it("accepts text and agreeing alternatives but rejects conflicting or invalid alternatives", async () => {
  expect(
    (await parseBluEmail(syntheticBluEml({ html: null, text: BLU_TEXT })))
      .format,
  ).toBe("TEXT");
  expect(
    (await parseBluEmail(syntheticBluEml({ text: BLU_TEXT }))).observation
      .amount,
  ).toBe(125001);
  const conflict = await parseBluEmail(
    syntheticBluEml({ text: BLU_TEXT.replace("125.001", "125.002") }),
  );
  expect(conflict.reasons).toContain("MIME_ALTERNATIVES_CONFLICT");
  expect(conflict.observation.amount).toBeNull();
  const broken = await parseBluEmail(
    syntheticBluEml({ text: "Notification format changed" }),
  );
  expect(broken.reasons).toContain(
    "CONTENT_INCOMPLETE_AMBIGUOUS_OR_UNSUPPORTED",
  );
});
it.each([
  BLU_HTML.replace("125.001", "125.001,50"),
  BLU_HTML.replace("125.001", "12.50.001"),
  BLU_HTML.replace("125.001", "9.999.999.999"),
  BLU_HTML.replace("Nominal Transfer", "Saldo Rekening"),
  BLU_HTML.replace("Tgl &amp; Jam Transaksi", "Waktu pembukuan"),
  BLU_HTML.replace("14 Nov 2026", "31 Feb 2026"),
  BLU_HTML.replace("WIB", "WITA"),
  BLU_HTML.replace("0000 1111 2222", "••••2222"),
  BLU_HTML.replace("BI-FAST", "REFUND"),
  BLU_HTML.replace("Ada transaksi masuk", "Ada transaksi keluar"),
  BLU_HTML.replace(
    "</body>",
    "<div>Nominal Transfer</div><div>Rp125.001,00</div></body>",
  ),
])(
  "holds missing, malformed, ambiguous, non-incoming and changed-format content without inventing fields",
  async (html) => {
    const result = await parseBluEmail(syntheticBluEml({ html }));
    expect(result.disposition).toBe("REVIEW_REQUIRED");
    expect(result.observation.amount).toBeNull();
    expect(result.observation.trusted).toBe(false);
    expect(result.observation.bankTxId).toBeUndefined();
  },
);
it("does not confuse threading References with a forwarded bank notification", async () => {
  const threaded = await parseBluEmail(
    syntheticBluEml({
      headers: ["References: <synthetic-thread@example.test>"],
    }),
  );
  expect(threaded.threadContextPresent).toBe(true);
  expect(threaded.observation.amount).toBe(125001);
  for (const options of [
    { subject: "Fwd: Info Transaksi Masuk ke blu Kamu" },
    { headers: ["Resent-From: fixture@example.test"] },
  ]) {
    const forwarded = await parseBluEmail(syntheticBluEml(options));
    expect(forwarded.reasons).toContain("FORWARDED_OR_RESENT");
    expect(forwarded.observation.amount).toBeNull();
  }
});
it("rejects forged From domains, duplicate critical headers and apparent authentication passes", async () => {
  const forged = await parseBluEmail(
    syntheticBluEml({ from: "synthetic@blubybcadigital.id.attacker.test" }),
  );
  expect(forged.reasons).toContain("UNEXPECTED_SENDER_DOMAIN");
  expect(forged.observation.trusted).toBe(false);
  const duplicate = await parseBluEmail(
    syntheticBluEml({ headers: ["From: fixture@example.test"] }),
  );
  expect(duplicate.reasons).toContain("DUPLICATE_CRITICAL_HEADER");
  expect(duplicate.observation.amount).toBeNull();
  const claims = await parseBluEmail(
    syntheticBluEml({
      headers: [
        "Authentication-Results: mx.google.com; dkim=fail; spf=fail; dmarc=fail",
      ],
    }),
  );
  expect(claims.authentication.claims.dkim).toEqual(["pass", "fail"]);
  expect(claims.observation.trusted).toBe(false);
});
it("keeps mail identity distinct from money identity across duplicate deliveries and same-amount transfers", async () => {
  const raw = syntheticBluEml(),
    a = await parseBluEmail(raw, "gmailA"),
    b = await parseBluEmail(raw, "gmailB");
  expect(a.observation.externalId).toBe(b.observation.externalId);
  expect(a.observation.messageId).not.toBe(b.observation.messageId);
  const different = await parseBluEmail(
    syntheticBluEml({ messageId: "<synthetic-blu-0002@example.test>" }),
    "gmailC",
  );
  expect(different.observation.externalId).not.toBe(a.observation.externalId);
  expect(different.observation.amount).toBe(a.observation.amount);
  expect(different.observation.bankTxId).toBeUndefined();
  const noId = await parseBluEmail(syntheticBluEml({ messageId: null }));
  expect(noId.reasons).toContain("RFC_MESSAGE_ID_MISSING_OR_INVALID");
  expect(noId.observation.externalId).toMatch(/^raw-message:[a-f0-9]{64}$/);
  const attempt = {
    payable: 125001,
    createdAt: new Date("2026-11-14T03:00:00Z"),
    expiresAt: new Date("2026-11-14T03:30:00Z"),
  };
  expect(
    matchReason(a.observation, attempt, new Date("2026-11-14T03:21:00Z")),
  ).toBe("AMOUNT_TIME_ONLY_REQUIRES_SELLER");
  expect(
    matchReason(
      a.observation,
      { ...attempt, payable: 125000 },
      new Date("2026-11-14T03:21:00Z"),
    ),
  ).toBe("OVERPAYMENT");
  expect(
    matchReason(
      a.observation,
      { ...attempt, payable: 125002 },
      new Date("2026-11-14T03:21:00Z"),
    ),
  ).toBe("UNDERPAYMENT");
  expect(
    matchReason(a.observation, attempt, new Date("2026-11-14T04:00:00Z")),
  ).toBe("LATE_PAYMENT_REVIEW");
});
it("never executes/fetches HTML resources, ignores hidden text, and bounds malformed MIME/DOM", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  const html = BLU_HTML.replace(
    "<body>",
    '<body><script>fetch("https://attacker.example.test")</script><img src="https://attacker.example.test"><div hidden>Nominal Transfer\nRp1,00</div>',
  );
  expect(
    (await parseBluEmail(syntheticBluEml({ html }))).observation.amount,
  ).toBe(125001);
  expect(spy).not.toHaveBeenCalled();
  const truncated = await parseBluEmail(
    syntheticBluEml({ closeBoundary: false }),
  );
  expect(truncated.reasons).toContain("MIME_TRUNCATED");
  expect(truncated.observation.amount).toBeNull();
  await expect(
    parseBluEmail(Buffer.alloc(MAX_BLU_EMAIL_BYTES + 1)),
  ).rejects.toThrow("Ukuran email");
  await expect(
    parseBluEmail(syntheticBluEml(), "../another-message"),
  ).rejects.toThrow("Identitas pesan");
  expect(() =>
    bluHtmlText("<div>".repeat(100) + "x" + "</div>".repeat(100)),
  ).toThrow("rumit");
  const oversizedHeader = await parseBluEmail(
    syntheticBluEml({ headers: ["X-Long: " + "x".repeat(33000)] }),
  );
  expect(oversizedHeader.reasons).toContain("MIME_INVALID_OR_LIMIT");
});
it("retrieves only the requested bounded Gmail raw message without trusting its headers (mock)", async () => {
  const raw = syntheticBluEml(),
    fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "gmailABC", raw: raw.toString("base64url") }),
        ),
      );
  vi.stubGlobal("fetch", fetchMock);
  const retrieved = await getGmailRawMessage("synthetic-access", "gmailABC");
  const url = fetchMock.mock.calls[0][0] as URL;
  expect(url.origin).toBe("https://gmail.googleapis.com");
  expect(url.searchParams.get("format")).toBe("raw");
  expect(retrieved.raw.equals(raw)).toBe(true);
  expect(
    (await parseBluEmail(retrieved.raw, retrieved.apiMessageId)).observation
      .trusted,
  ).toBe(false);
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ id: "anotherMessage", raw: raw.toString("base64url") }),
    ),
  );
  await expect(
    getGmailRawMessage("synthetic-access", "gmailABC"),
  ).rejects.toThrow("Respons pesan");
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ id: "gmailABC", raw: "a" })),
  );
  await expect(
    getGmailRawMessage("synthetic-access", "gmailABC"),
  ).rejects.toThrow("encoding");
  fetchMock.mockResolvedValue(
    new Response("private provider details", { status: 401 }),
  );
  await expect(
    getGmailRawMessage("synthetic-access", "gmailABC"),
  ).rejects.toThrow("hubungkan ulang");
});

// Explicit opt-in local check. Original input is never a repository fixture and
// assertions reveal only booleans/codes, not amounts, names, dates, addresses or IDs.
it.skipIf(!process.env.BLU_ORIGINAL_EML_PATH)(
  "locally parses the owner-provided original without exposing its fields",
  async () => {
    const result = await parseBluEmail(
      readFileSync(process.env.BLU_ORIGINAL_EML_PATH!),
    );
    const decoded = await PostalMime.parse(
      readFileSync(process.env.BLU_ORIGINAL_EML_PATH!),
    );
    // Independent, private in-memory cross-check of the labelled original amount.
    // On failure only a boolean is printed, never the captured amount or source.
    const region =
      decoded.html?.split("Nominal Transfer")[1]?.split("bluAccount")[0] || "";
    const originalAmount = />\s*(\d{1,3}(?:\.\d{3})+)\s*</.exec(region)?.[1];
    expect(
      !!originalAmount &&
        result.observation.amount ===
          Number(originalAmount.replaceAll(".", "")),
    ).toBe(true);
    expect(result.format === "HTML").toBe(true);
    expect(
      result.observation.amount !== null && result.observation.amount > 0,
    ).toBe(true);
    expect(result.observation.accountRef.length === 64).toBe(true);
    expect(
      result.observation.occurredAt !== null &&
        Number.isFinite(+result.observation.occurredAt),
    ).toBe(true);
    expect(result.rfcMessageIdAvailable).toBe(true);
    expect(result.bankReferenceAvailable).toBe(false);
    expect(result.observation.bankTxId === undefined).toBe(true);
    expect(result.observation.trusted).toBe(false);
    expect(result.authentication.claims.dkim.includes("pass")).toBe(true);
    expect(
      result.reasons.includes("CONTENT_INCOMPLETE_AMBIGUOUS_OR_UNSUPPORTED"),
    ).toBe(false);
  },
);
