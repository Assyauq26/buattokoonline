import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  allocateAmount,
  evidenceReason,
  idr,
  matchReason,
  type Observation,
} from "@/modules/payments/evidence/policy";
import {
  crc16,
  dynamicQris,
  qrisPng,
  validateStaticQris,
} from "@/modules/payments/evidence/qris";
import { seal, unseal } from "@/modules/payments/evidence/secrets";
import {
  normalizeGoPay,
  parseSyntheticBank,
  SUPPORTED_PRODUCTION_BANKS,
} from "@/modules/payments/evidence/adapters";
import { pollEvidence } from "@/modules/payments/evidence/poller";
import {
  boundedJson,
  listGmailMessages,
  refreshGoogle,
} from "@/modules/payments/evidence/google";

const tlv = (id: string, value: string) =>
  id + String(value.length).padStart(2, "0") + value;
const fixtureBody =
  tlv("00", "01") +
  tlv("01", "11") +
  tlv("26", tlv("00", "ID.CO.TEST") + tlv("01", "merchant-test")) +
  tlv("52", "5999") +
  tlv("53", "360") +
  tlv("58", "ID") +
  tlv("59", "SYNTHETIC STORE") +
  tlv("60", "TEST CITY") +
  "6304";
const staticQr = fixtureBody + crc16(fixtureBody);
const observation = (): Observation => ({
  externalId: "provider-1",
  bankTxId: "provider-1",
  amount: 10001,
  currency: "IDR",
  direction: "CREDIT",
  status: "SETTLEMENT",
  occurredAt: new Date("2026-01-01T00:01:00Z"),
  accountRef: "merchant-test",
  trusted: true,
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("payment evidence safety policy", () => {
  it("allocates across different bases and retained nominal collisions", () => {
    expect(allocateAmount(10000, new Set([10001, 10002]))).toEqual({
      baseAmount: 10000,
      uniqueCode: 3,
      payable: 10003,
    });
    expect(allocateAmount(10001, new Set([10002]))).toHaveProperty(
      "payable",
      10003,
    );
    expect(() => allocateAmount(10000, new Set([10001, 10002]), 2)).toThrow(
      "habis",
    );
  });
  it.each([1.1, -1, 0, NaN, Infinity, 2_147_483_648, "1000"])(
    "rejects unsafe money %s",
    (value) => expect(() => idr(value)).toThrow(),
  );
  it.each([
    [{ bankTxId: undefined }, "MISSING_STABLE_TRANSACTION_ID"],
    [{ trusted: false }, "UNVERIFIED_PROVENANCE"],
    [{ accountRef: "another-shop" }, "ACCOUNT_MISMATCH"],
    [{ currency: "USD" }, "NON_IDR_OR_NON_CREDIT"],
    [{ direction: "DEBIT" }, "NON_IDR_OR_NON_CREDIT"],
    [{ status: "REFUND" }, "REFUND_OR_REVERSAL"],
    [{ status: "PARTIAL_REFUND" }, "REFUND_OR_REVERSAL"],
    [{ status: "CAPTURE" }, "UNKNOWN_OR_UNSETTLED_STATUS"],
    [{ status: "" }, "UNKNOWN_OR_UNSETTLED_STATUS"],
    [{ amount: null }, "INVALID_AMOUNT"],
    [{ occurredAt: null }, "INVALID_TIME"],
  ] as const)("holds unsafe evidence %j", (change, reason) =>
    expect(
      evidenceReason({ ...observation(), ...change }, "merchant-test"),
    ).toBe(reason),
  );
  it("never turns a unique amount/time match into paid", () => {
    const a = {
      payable: 10001,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-01-01T00:10:00Z"),
    };
    expect(evidenceReason(observation(), "merchant-test")).toBe(
      "SELLER_REVIEW_REQUIRED",
    );
    expect(matchReason(observation(), a, observation().occurredAt!)).toBe(
      "AMOUNT_TIME_ONLY_REQUIRES_SELLER",
    );
    expect(matchReason(observation(), a, new Date("2026-01-02"))).toBe(
      "LATE_PAYMENT_REVIEW",
    );
    expect(
      matchReason(
        { ...observation(), amount: 10000 },
        a,
        observation().occurredAt!,
      ),
    ).toBe("UNDERPAYMENT");
    expect(
      matchReason(
        { ...observation(), amount: 10002 },
        a,
        observation().occurredAt!,
      ),
    ).toBe("OVERPAYMENT");
  });
});

describe("local QRIS", () => {
  it("verifies CRC and preserves destination while encoding exact integer nominal", async () => {
    const before = validateStaticQris(staticQr),
      after = dynamicQris(staticQr, 10001);
    expect(after.destination).toBe(before.destination);
    expect(after.payload).toContain("010212");
    expect(after.payload).toContain("540510001");
    expect(after.payload.slice(-4)).toBe(crc16(after.payload.slice(0, -4)));
    expect(
      (await qrisPng(staticQr, 10001)).subarray(0, 8).toString("hex"),
    ).toBe("89504e470d0a1a0a");
  });
  it.each([
    staticQr.slice(0, -4) + "0000",
    "garbage",
    staticQr + "x",
    staticQr.replace("360", "840"),
    staticQr.replace("ID", "US"),
  ])("rejects corrupt/unsupported QR %s", (payload) =>
    expect(() => dynamicQris(payload, 1)).toThrow(),
  );
  it("rejects duplicate tags, dynamic QR, extra fees and truncated TLV even with repaired CRC", () => {
    for (const body of [
      fixtureBody.slice(0, -4) + tlv("53", "360") + "6304",
      fixtureBody.replace("010211", "010212"),
      fixtureBody.replace("5802ID", tlv("55", "01") + "5802ID"),
      fixtureBody.replace("5915", "5999"),
    ])
      expect(() => validateStaticQris(body + crc16(body))).toThrow();
  });
});

describe("secret isolation", () => {
  it("authenticates tenant, source, purpose and ciphertext; does not share IVs", () => {
    vi.stubEnv(
      "PAYMENT_INTEGRATION_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    const a = seal("private-refresh-token", "shop-A", "source-A", "google");
    expect(a).not.toContain("private-refresh-token");
    expect(a).not.toBe(
      seal("private-refresh-token", "shop-A", "source-A", "google"),
    );
    expect(unseal(a, "shop-A", "source-A", "google")).toBe(
      "private-refresh-token",
    );
    for (const context of [
      ["shop-B", "source-A", "google"],
      ["shop-A", "source-B", "google"],
      ["shop-A", "source-A", "otp"],
    ])
      expect(() =>
        unseal(a, ...(context as [string, string, string])),
      ).toThrow();
    expect(() =>
      unseal(a.slice(0, -3) + "aaa", "shop-A", "source-A", "google"),
    ).toThrow();
  });
  it("fails closed without a dedicated key", () =>
    expect(() => seal("token", "shop", "source", "google")).toThrow());
});

describe("unverified source contracts", () => {
  const raw = {
    id: "tx-1",
    merchant_id: "m-1",
    gross_amount: "10001",
    transaction_status: "SETTLEMENT",
    transaction_time: "2026-01-01T00:01:00Z",
    currency: "IDR",
    payment_type: "QRIS",
  };
  it("does not trust a fixture GoPay payload or assume a missing status is paid", () => {
    expect(normalizeGoPay(raw, "m-1").trusted).toBe(false);
    for (const change of [
      { gross_amount: "10001.50" },
      { transaction_status: undefined },
      { merchant_id: "m-2" },
      { gross_amount: "10001junk" },
    ])
      expect(() => normalizeGoPay({ ...raw, ...change }, "m-1")).toThrow();
  });
  it("has no supported production banks and cannot trust spoofed DKIM headers", () => {
    expect(SUPPORTED_PRODUCTION_BANKS).toEqual([]);
    const message = {
      id: "message-1",
      headers: [
        { name: "Authentication-Results", value: "mx.google.com; dkim=pass" },
      ],
      body: "HUBIFY SYNTHETIC BANK\nTX:tx-1\nACCOUNT:test\nIDR:10001\nDIRECTION:CREDIT\nSTATUS:SETTLEMENT\nTIME:2026-01-01T00:01:00Z",
    };
    expect(parseSyntheticBank(message).trusted).toBe(false);
    expect(() =>
      parseSyntheticBank({ ...message, body: "Fwd:\n" + message.body }),
    ).toThrow();
    expect(() =>
      parseSyntheticBank({
        ...message,
        headers: [{ name: "X-Forwarded-For", value: "bank.example" }],
      }),
    ).toThrow();
    expect(() =>
      parseSyntheticBank({
        ...message,
        body: "Bank notification changed format",
      }),
    ).toThrow();
  });
});

describe("bounded polling and Google failures (mock only)", () => {
  it("times out even if a transport ignores cancellation", async () => {
    vi.useFakeTimers();
    const result = pollEvidence(
      { page: () => new Promise(() => {}) },
      { since: new Date() },
      async () => {},
    );
    const rejected = expect(result).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
  });
  it("persists paginated observations, overlaps late window, bounds partial scans", async () => {
    const persist = vi.fn(async () => {}),
      page = vi
        .fn()
        .mockResolvedValueOnce({ observations: [observation()], next: "page2" })
        .mockResolvedValueOnce({ observations: [observation()] });
    expect(
      await pollEvidence({ page }, { since: new Date("2026-01-08") }, persist),
    ).toEqual({ count: 2, complete: true });
    expect(page.mock.calls[0][0].since.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(page.mock.calls[1][0].cursor).toBe("page2");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(
      await pollEvidence(
        { page: async () => ({ observations: [], next: "page2" }) },
        { since: new Date() },
        persist,
        1,
      ),
    ).toHaveProperty("complete", false);
  });
  it("fails on loops, provider errors and ingest failure without assuming caught up", async () => {
    await expect(
      pollEvidence(
        { page: async () => ({ observations: [], next: "same" }) },
        { since: new Date() },
        async () => {},
      ),
    ).rejects.toThrow("Paginasi");
    await expect(
      pollEvidence(
        {
          page: async () => {
            throw new Error("429");
          },
        },
        { since: new Date() },
        async () => {},
      ),
    ).rejects.toThrow("429");
    await expect(
      pollEvidence(
        { page: async () => ({ observations: [observation()] }) },
        { since: new Date() },
        async () => {
          throw new Error("crash");
        },
      ),
    ).rejects.toThrow("crash");
  });
  it("rejects oversized/invalid responses and handles 401/429 without leaking tokens", async () => {
    await expect(
      boundedJson(new Response("x".repeat(100)), 50),
    ).rejects.toThrow("terlalu besar");
    await expect(boundedJson(new Response("invalid"))).rejects.toThrow(
      "tidak valid",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("secret provider error", { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response("secret provider error", { status: 429 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      listGmailMessages("private-token", new Date()),
    ).rejects.toThrow("hubungkan ulang");
    await expect(
      listGmailMessages("private-token", new Date()),
    ).rejects.toThrow("sementara");
    expect(fetchMock.mock.calls[0][0].origin).toBe(
      "https://gmail.googleapis.com",
    );
  });
  it("keeps a valid access token and refreshes expired tokens with the official endpoint", async () => {
    const active = {
      access: "access",
      refresh: "refresh",
      expiresAt: Date.now() + 120000,
    };
    expect(await refreshGoogle(active)).toBe(active);
    vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "true");
    vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
    vi.stubEnv("APP_ORIGIN", "https://shop.example.test");
    vi.stubEnv("PAYMENT_GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("PAYMENT_GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        ),
      ),
    );
    expect(await refreshGoogle({ ...active, expiresAt: 0 })).toMatchObject({
      access: "new",
      refresh: "refresh",
    });
  });
});
