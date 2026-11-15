import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const browser = vi.hoisted(() => ({
  cookie: "synthetic-seller-browser-session",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: browser.cookie }) }),
}));
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  allocateAttempt,
  allocateNewAttempt,
  acquireSourceLease,
  ingestObservation,
  claimEvidence,
  finishSourceLease,
} from "@/modules/payments/evidence/repository";
import {
  createSource,
  disconnectSource,
} from "@/modules/payments/evidence/settings";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { Observation } from "@/modules/payments/evidence/policy";
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
} from "@/modules/payments/evidence/google";
import { seal, unseal } from "@/modules/payments/evidence/secrets";
import { reviewGmailNow } from "@/modules/payments/evidence/gmail-review";
import { parseBluEmail } from "@/modules/payments/evidence/blu-email";
import { ingestBluEmailReview } from "@/modules/payments/evidence/blu-ingestion";
import { BLU_HTML, syntheticBluEml } from "../fixtures/blu-email";
import { evidenceCandidateSuggestions } from "@/modules/payments/evidence/candidate-suggestions";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  url.protocol !== "postgresql:" ||
  url.hostname !== "127.0.0.1" ||
  !["5568", "5432"].includes(url.port) ||
  url.pathname !== "/hubify_payment_evidence_test"
)
  throw new Error(
    "Requires isolated local hubify_payment_evidence_test database on port 5568 or CI port 5432",
  );
const scope = `payment-test-${randomUUID()}`;
let actor: string, customer: string, source: string;
const now = new Date();
const observation = (id: string, amount: number): Observation => ({
  externalId: id,
  bankTxId: id,
  amount,
  currency: "IDR",
  direction: "CREDIT",
  status: "SETTLEMENT",
  accountRef: "test-merchant",
  occurredAt: new Date(now.getTime() + 1000),
  trusted: true,
});
beforeAll(async () => {
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "true");
  const role = await prisma.role
    .create({ data: { name: "Admin", label: "Test admin" } })
    .catch(() => prisma.role.findUniqueOrThrow({ where: { name: "Admin" } }));
  for (const key of [
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.PAYMENT_VERIFY,
    PERMISSIONS.BANK_MANAGE,
  ]) {
    const p = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, label: key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }
  actor = (
    await prisma.user.create({
      data: {
        name: "Operator fixture",
        email: `${randomUUID()}@example.test`,
        passwordHash: "disabled",
        roles: { create: { roleId: role.id } },
      },
    })
  ).id;
  customer = (
    await prisma.user.create({
      data: {
        name: "Customer fixture",
        email: `${randomUUID()}@example.test`,
        passwordHash: "disabled",
      },
    })
  ).id;
  source = (
    await prisma.paymentEvidenceSource.create({
      data: {
        storeScope: scope,
        kind: "GOPAY_QRIS",
        label: "Synthetic only",
        accountRef: "test-merchant",
      },
    })
  ).id;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

async function reviewFixture() {
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "true");
  vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
  vi.stubEnv(
    "PAYMENT_INTEGRATION_ENCRYPTION_KEY",
    Buffer.alloc(32, 9).toString("base64"),
  );
  const account = randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
  const raw = Buffer.from(
    syntheticBluEml({
      html: BLU_HTML.replace("0000 1111 2222", account),
      messageId: `<${randomUUID()}@example.test>`,
    }),
  );
  const parsed = await parseBluEmail(raw);
  const source = await prisma.paymentEvidenceSource.create({
    data: {
      storeScope: scope,
      kind: "GMAIL_BANK",
      label: "Synthetic manual read",
      accountRef: parsed.observation.accountRef,
    },
  });
  await prisma.paymentEvidenceSource.update({
    where: { id: source.id },
    data: {
      encryptedSecret: seal(
        JSON.stringify({
          access: "synthetic-access",
          refresh: "synthetic-refresh",
          expiresAt: Date.now() + 3600_000,
        }),
        scope,
        source.id,
        "google-tokens",
      ),
    },
  });
  return { source, raw };
}

it("manual Gmail read persists untrusted candidates once across retry and paginated restart without settling payments", async () => {
  const { source: s, raw } = await reviewFixture();
  const before = await prisma.payment.findMany({
    select: { id: true, status: true, amount: true },
    orderBy: { id: "asc" },
  });
  let page = 0;
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://gmail.googleapis.com");
    if (url.pathname.endsWith("/messages")) {
      expect(url.searchParams.get("maxResults")).toBe("5");
      expect(url.searchParams.get("q")).toContain("blubybcadigital.id");
      if (page++)
        expect(url.searchParams.get("pageToken")).toBe("synthetic-page-2");
      return new Response(
        JSON.stringify({
          messages: [{ id: "synthetic-message" }],
          ...(page === 1 ? { nextPageToken: "synthetic-page-2" } : {}),
        }),
      );
    }
    return new Response(
      JSON.stringify({
        id: "synthetic-message",
        raw: raw.toString("base64url"),
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await reviewGmailNow(actor, s.id)).toEqual({
    count: 1,
    limited: true,
    reviewOnly: true,
  });
  await expect(reviewGmailNow(actor, s.id)).rejects.toThrow("jeda");
  await prisma.paymentEvidenceSource.update({
    where: { id: s.id },
    data: { nextPollAt: null },
  });
  expect(await reviewGmailNow(actor, s.id)).toEqual({
    count: 1,
    limited: false,
    reviewOnly: true,
  });
  expect(
    await prisma.incomingPaymentEvidence.count({ where: { sourceId: s.id } }),
  ).toBe(1);
  expect(
    await prisma.incomingPaymentEvidence.findFirst({
      where: { sourceId: s.id },
    }),
  ).toMatchObject({ trusted: false, amount: 125001, bankTxId: null });
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: s.id } }),
  ).toMatchObject({
    enabled: false,
    cursor: "",
    health: "REVIEW_ONLY",
    leaseToken: null,
  });
  expect(
    await prisma.payment.findMany({
      select: { id: true, status: true, amount: true },
      orderBy: { id: "asc" },
    }),
  ).toEqual(before);
  expect(
    await prisma.paymentEvidenceClaim.count({
      where: { evidence: { sourceId: s.id } },
    }),
  ).toBe(0);
  vi.unstubAllGlobals();
});

it("manual Gmail read cannot persist after disconnect during the remote request", async () => {
  const { source: s, raw } = await reviewFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "oauth2.googleapis.com") return new Response("");
      if (url.pathname.endsWith("/messages"))
        return new Response(
          JSON.stringify({ messages: [{ id: "synthetic-message" }] }),
        );
      await disconnectSource(actor, s.id);
      return new Response(
        JSON.stringify({
          id: "synthetic-message",
          raw: raw.toString("base64url"),
        }),
      );
    }),
  );
  await expect(reviewGmailNow(actor, s.id)).rejects.toThrow("koneksi berubah");
  expect(
    await prisma.incomingPaymentEvidence.count({ where: { sourceId: s.id } }),
  ).toBe(0);
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: s.id } }),
  ).toMatchObject({
    health: "DISCONNECTED",
    encryptedSecret: null,
    leaseToken: null,
  });
  vi.unstubAllGlobals();
});

it("manual Gmail errors redact provider bodies, preserve cursor and enforce tenant/permission/flag fences", async () => {
  const { source: s } = await reviewFixture();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("PRIVATE_PROVIDER_BODY_TOKEN", { status: 503 }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(reviewGmailNow(customer, s.id)).rejects.toThrow("izin");
  vi.stubEnv("STORE_INSTALLATION_ID", "other-installation");
  await expect(reviewGmailNow(actor, s.id)).rejects.toThrow("tidak ditemukan");
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "false");
  await expect(reviewGmailNow(actor, s.id)).rejects.toThrow(
    "belum dikonfigurasi",
  );
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
  await expect(reviewGmailNow(actor, s.id)).rejects.toThrow(
    "Pembacaan Gmail belum selesai",
  );
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: s.id } }),
  ).toMatchObject({
    cursor: null,
    leaseToken: null,
    enabled: false,
    health: "TEMPORARILY_UNAVAILABLE",
    failures: 1,
  });
  vi.unstubAllGlobals();
});

it("stale generations cannot acquire a lease or change disconnected source health", async () => {
  const { source: s } = await reviewFixture();
  await prisma.paymentEvidenceSource.update({
    where: { id: s.id },
    data: {
      generation: { increment: 1 },
      encryptedSecret: null,
      health: "DISCONNECTED",
    },
  });
  expect(await acquireSourceLease(s.id, new Date(), s.generation)).toBeNull();
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: s.id } }),
  ).toMatchObject({ leaseToken: null, health: "DISCONNECTED" });
});

it("binds official OAuth state to browser/actor/source, consumes once, encrypts tokens and reports failed remote revoke", async () => {
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
  vi.stubEnv("PAYMENT_GOOGLE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("PAYMENT_GOOGLE_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv(
    "PAYMENT_INTEGRATION_ENCRYPTION_KEY",
    Buffer.alloc(32, 9).toString("base64"),
  );
  vi.stubEnv("APP_ORIGIN", "https://fixture.example.test");
  const gmail = await prisma.paymentEvidenceSource.create({
    data: {
      storeScope: scope,
      kind: "GMAIL_BANK",
      label: "Synthetic OAuth",
      accountRef: randomUUID(),
    },
  });
  const start = new URL(await beginGoogleOAuth(actor, gmail.id));
  expect(start.origin).toBe("https://accounts.google.com");
  expect(start.searchParams.get("scope")).toBe(
    "https://www.googleapis.com/auth/gmail.readonly",
  );
  expect(start.searchParams.get("redirect_uri")).toBe(
    "https://fixture.example.test/api/v1/admin/payment-evidence/oauth/callback",
  );
  expect(start.searchParams.get("code_challenge_method")).toBe("S256");
  const state = start.searchParams.get("state")!;
  browser.cookie = "another-browser-session";
  await expect(
    completeGoogleOAuth(actor, state, "synthetic-code"),
  ).rejects.toThrow("Sesi OAuth");
  browser.cookie = "synthetic-seller-browser-session";
  await expect(
    completeGoogleOAuth(customer, state, "synthetic-code"),
  ).rejects.toThrow("izin");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "private-access-token",
          refresh_token: "private-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "https://www.googleapis.com/auth/gmail.readonly",
        }),
      ),
    )
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  await completeGoogleOAuth(actor, state, "synthetic-code");
  await expect(
    completeGoogleOAuth(actor, state, "synthetic-code"),
  ).rejects.toThrow("Sesi OAuth");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const saved = await prisma.paymentEvidenceSource.findUniqueOrThrow({
    where: { id: gmail.id },
  });
  expect(saved.enabled).toBe(false);
  expect(saved.health).toBe("CONNECTED_PARSER_BLOCKED");
  expect(saved.encryptedSecret).not.toContain("private-");
  expect(
    JSON.parse(
      unseal(saved.encryptedSecret!, scope, gmail.id, "google-tokens"),
    ),
  ).toHaveProperty("refresh", "private-refresh-token");
  expect(await disconnectSource(actor, gmail.id)).toEqual({
    disconnected: true,
    remoteRevoked: false,
  });
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: gmail.id } }),
  ).toMatchObject({
    encryptedSecret: null,
    enabled: false,
    health: "DISCONNECTED",
  });
  expect(
    await prisma.paymentEvidenceReview.count({
      where: { sourceId: gmail.id, action: "REMOTE_REVOKE_REQUIRED" },
    }),
  ).toBe(1);
  vi.unstubAllGlobals();
});

it("revokes tokens issued after a concurrent disconnect instead of saving a stale callback", async () => {
  const gmail = await prisma.paymentEvidenceSource.create({
    data: {
      storeScope: scope,
      kind: "GMAIL_BANK",
      label: "Interrupted synthetic OAuth",
      accountRef: randomUUID(),
    },
  });
  const state = new URL(
    await beginGoogleOAuth(actor, gmail.id),
  ).searchParams.get("state")!;
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    if (String(url) === "https://oauth2.googleapis.com/token") {
      await disconnectSource(actor, gmail.id);
      return new Response(
        JSON.stringify({
          access_token: "discarded-access",
          refresh_token: "discarded-refresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      );
    }
    expect(String(url)).toBe("https://oauth2.googleapis.com/revoke");
    return new Response("");
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    completeGoogleOAuth(actor, state, "synthetic-code"),
  ).rejects.toThrow("Konfigurasi berubah");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: gmail.id } }),
  ).toMatchObject({ encryptedSecret: null, health: "DISCONNECTED" });
  expect(
    await prisma.paymentEvidenceReview.count({
      where: { sourceId: gmail.id, action: "DISCARDED_OAUTH_REVOKED" },
    }),
  ).toBe(1);
  vi.unstubAllGlobals();
});

async function makePayment(total: number) {
  return prisma.payment.create({
    data: {
      amount: total,
      order: {
        create: {
          orderNumber: randomUUID(),
          userId: customer,
          subtotal: total,
          total,
          expiresAt: new Date(now.getTime() + 600_000),
        },
      },
    },
  });
}
async function attempt(paymentId: string, baseAmount = 10000) {
  return prisma.$transaction((tx) =>
    allocateAttempt(
      tx,
      {
        sourceId: source,
        paymentId,
        baseAmount,
        expiresAt: new Date(now.getTime() + 600_000),
      },
      now,
    ),
  );
}

it("preserves receiving-account identity across bank edits and does not create a new claim scope", async () => {
  const accountNumber =
    Date.now().toString() +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
  const first = await prisma.bankAccount.create({
    data: {
      bankName: "Synthetic original",
      accountNumber,
      accountHolder: "Fixture",
      displayName: "Original version",
    },
  });
  const configured = await createSource(actor, {
    kind: "GMAIL_BANK",
    label: "Version-bound source",
    accountRef: first.id,
  });
  await prisma.bankAccount.update({
    where: { id: first.id },
    data: { isActive: false, deletedAt: new Date() },
  });
  const second = await prisma.bankAccount.create({
    data: {
      bankName: "Changed display label",
      accountNumber,
      accountHolder: "Fixture",
      displayName: "Replacement version",
    },
  });
  await expect(
    createSource(actor, {
      kind: "GMAIL_BANK",
      label: "Must not duplicate money",
      accountRef: second.id,
    }),
  ).rejects.toThrow("sudah dikonfigurasi");
  expect(
    await prisma.paymentEvidenceSource.findUnique({
      where: { id: configured.id },
    }),
  ).toHaveProperty("bankAccountId", first.id);
});

it("serializes equal-base allocations from concurrent transactions and retains cancelled amounts", async () => {
  const create = () =>
    prisma.$transaction((tx) =>
      allocateNewAttempt(
        tx,
        {
          sourceId: source,
          baseAmount: 10000,
          expiresAt: new Date(now.getTime() + 600_000),
        },
        (amount) =>
          tx.payment.create({
            data: {
              amount,
              order: {
                create: {
                  orderNumber: randomUUID(),
                  userId: customer,
                  subtotal: 10000,
                  total: amount,
                  expiresAt: new Date(now.getTime() + 600_000),
                },
              },
            },
            include: { order: true },
          }),
        now,
      ),
    );
  const [a, b] = await Promise.all([create(), create()]);
  expect([a.payable, b.payable].sort()).toEqual([10001, 10002]);
  expect(await attempt(a.paymentId)).toHaveProperty("id", a.id);
  const p1 = await prisma.payment.findUniqueOrThrow({
    where: { id: a.paymentId },
  });
  await prisma.order.update({
    where: { id: p1.orderId },
    data: { status: "CANCELLED" },
  });
  const p3 = await makePayment(10003);
  expect(await attempt(p3.id)).toHaveProperty("payable", 10003);
});
it.each([5, 10] as const)(
  "issues a canonical %s-minute deadline to both new order and attempt",
  async (windowMinutes) => {
    const issuedAt = new Date();
    const s = await prisma.paymentEvidenceSource.create({
      data: {
        storeScope: scope,
        kind: "GMAIL_BANK",
        label: "Window fixture",
        accountRef: randomUUID(),
      },
    });
    const attempt = await prisma.$transaction((tx) =>
      allocateNewAttempt(
        tx,
        { sourceId: s.id, baseAmount: 45000, windowMinutes },
        (amount, expiresAt) =>
          tx.payment.create({
            data: {
              amount,
              order: {
                create: {
                  orderNumber: randomUUID(),
                  userId: customer,
                  subtotal: 45000,
                  total: amount,
                  expiresAt,
                },
              },
            },
            include: { order: true },
          }),
        issuedAt,
      ),
    );
    expect(+attempt.expiresAt - +issuedAt).toBe(windowMinutes * 60000);
    const p = await prisma.payment.findUniqueOrThrow({
      where: { id: attempt.paymentId },
      include: { order: true },
    });
    expect(+p.order.expiresAt!).toBe(+attempt.expiresAt);
    const create = vi.fn(async () => p);
    await expect(
      prisma.$transaction((tx) =>
        allocateNewAttempt(
          tx,
          {
            sourceId: s.id,
            baseAmount: 45000,
            windowMinutes,
            expiresAt: new Date(+issuedAt + 3600000),
          },
          create,
          issuedAt,
        ),
      ),
    ).rejects.toThrow("Tenggat");
    expect(create).not.toHaveBeenCalled();
  },
);

it("rejects inconsistent payable totals atomically without rewriting the order", async () => {
  const p = await makePayment(10000);
  await expect(attempt(p.id)).rejects.toThrow("Total pembayaran");
  expect(
    await prisma.paymentEvidenceAttempt.findUnique({
      where: { paymentId: p.id },
    }),
  ).toBeNull();
  expect(
    await prisma.order.findUnique({ where: { id: p.orderId } }),
  ).toHaveProperty("total", 10000);
});
it("fences parallel workers, deduplicates two ingesters, survives a new client, and preserves changes for review", async () => {
  const leases = await Promise.all([
    acquireSourceLease(source, now),
    acquireSourceLease(source, now),
  ]);
  expect(leases.filter(Boolean)).toHaveLength(1);
  const lease = leases.find(Boolean)!;
  const o = observation(randomUUID(), 99999);
  const ids = await Promise.all([
    ingestObservation(source, lease.generation, lease.token, o, now),
    ingestObservation(source, lease.generation, lease.token, o, now),
  ]);
  expect(new Set(ids).size).toBe(1);
  const newProcessClient = new PrismaClient();
  expect(
    await newProcessClient.incomingPaymentEvidence.count({
      where: { sourceId: source, externalId: o.externalId },
    }),
  ).toBe(1);
  await newProcessClient.$disconnect();
  await ingestObservation(
    source,
    lease.generation,
    lease.token,
    { ...o, status: "REFUND" },
    now,
  );
  expect(
    await prisma.incomingPaymentEvidence.findUnique({ where: { id: ids[0] } }),
  ).toMatchObject({
    trusted: false,
    reason: "SOURCE_CHANGED_REQUIRES_REVIEW",
    providerStatus: "SETTLEMENT",
  });
  await expect(
    ingestObservation(source, lease.generation, "old-token", o, now),
  ).rejects.toThrow("Lease");
  await finishSourceLease(
    source,
    lease.token,
    lease.generation,
    { ok: false, cursor: "must-not-advance" },
    now,
  );
  expect(
    await prisma.paymentEvidenceSource.findUnique({ where: { id: source } }),
  ).toMatchObject({
    cursor: null,
    failures: 1,
    health: "TEMPORARILY_UNAVAILABLE",
  });
});
it("stores one permanent claim with an explicit actor and no paid/stock/notification side effects", async () => {
  const p = await makePayment(20001),
    a = await attempt(p.id, 20000);
  const lease = await acquireSourceLease(
    source,
    new Date(now.getTime() + 120_000),
  );
  const e = await ingestObservation(
    source,
    lease!.generation,
    lease!.token,
    {
      ...observation(randomUUID(), 20001),
      occurredAt: new Date(now.getTime() + 120_000),
    },
    new Date(now.getTime() + 120_000),
  );
  const results = await Promise.all([
    claimEvidence(
      actor,
      e,
      a.id,
      "Saya periksa mutasi asli dan identitas pembeli secara terpisah.",
      new Date(now.getTime() + 121_000),
    ),
    claimEvidence(
      actor,
      e,
      a.id,
      "Saya periksa mutasi asli dan identitas pembeli secara terpisah.",
      new Date(now.getTime() + 121_000),
    ),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(
    await prisma.payment.findUnique({ where: { id: p.id } }),
  ).toHaveProperty("status", "PENDING_PAYMENT");
  expect(
    await prisma.order.findUnique({ where: { id: p.orderId } }),
  ).toHaveProperty("paymentStatus", "PENDING_PAYMENT");
  expect(await prisma.notification.count({ where: { userId: customer } })).toBe(
    0,
  );
  const p2 = await makePayment(20002),
    b = await attempt(p2.id, 20000);
  await expect(
    claimEvidence(
      actor,
      e,
      b.id,
      "Mencoba menggunakan ulang transaksi yang sudah diklaim.",
      new Date(now.getTime() + 122_000),
    ),
  ).rejects.toThrow("sudah diklaim");
  await expect(
    prisma.paymentEvidenceClaim.create({
      data: {
        evidenceId: e,
        attemptId: b.id,
        actorId: actor,
        reason: "Mencoba klaim ulang melalui constraint database.",
      },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.paymentEvidenceSource.update({
      where: { id: source },
      data: { enabled: true },
    }),
  ).rejects.toThrow();
});
it("holds delayed, partial, excess, unknown, refund, missing identity, untrusted and closed-order evidence", async () => {
  const receiver = randomUUID();
  const s = await prisma.paymentEvidenceSource.create({
    data: {
      storeScope: scope,
      kind: "GOPAY_QRIS",
      label: "Unsafe synthetic cases",
      accountRef: receiver,
    },
  });
  const at = new Date(now.getTime() + 120_000),
    reviewAt = new Date(now.getTime() + 121_000);
  const lease = (await acquireSourceLease(s.id, at))!;
  const cases: Array<{
    patch?: Partial<Observation>;
    status?: "CANCELLED" | "EXPIRED" | "REFUNDED";
  }> = [
    { patch: { bankTxId: undefined } },
    { patch: { trusted: false } },
    { patch: { status: "REFUND" } },
    { patch: { status: "PARTIAL_REFUND" } },
    { patch: { status: "UNKNOWN" } },
    { patch: { amount: 1 } },
    { patch: { amount: 999999 } },
    { patch: { occurredAt: new Date(now.getTime() + 700_000) } },
    { patch: { occurredAt: new Date(now.getTime() - 60_000) } },
    { status: "CANCELLED" },
    { status: "EXPIRED" },
    { status: "REFUNDED" },
  ];
  for (let index = 0; index < cases.length; index++) {
    const base = 30000 + index * 1000,
      p = await makePayment(base + 1);
    const a = await prisma.$transaction((tx) =>
      allocateAttempt(
        tx,
        {
          sourceId: s.id,
          paymentId: p.id,
          baseAmount: base,
          expiresAt: new Date(now.getTime() + 600_000),
        },
        now,
      ),
    );
    if (cases[index].status)
      await prisma.order.update({
        where: { id: p.orderId },
        data: { status: cases[index].status },
      });
    const o = {
      ...observation(randomUUID(), base + 1),
      occurredAt: at,
      accountRef: receiver,
      ...cases[index].patch,
    };
    const evidence = await ingestObservation(
      s.id,
      lease.generation,
      lease.token,
      o,
      at,
    );
    await expect(
      claimEvidence(
        actor,
        evidence,
        a.id,
        "Test must reject unsafe evidence without touching money.",
        reviewAt,
      ),
    ).rejects.toThrow("penanganan terpisah");
    expect(
      await prisma.payment.findUnique({ where: { id: p.id } }),
    ).toHaveProperty("status", "PENDING_PAYMENT");
  }
  expect(
    await prisma.paymentEvidenceClaim.count({
      where: { evidence: { sourceId: s.id } },
    }),
  ).toBe(0);
});

it("deduplicates blu MIME across parallel/retry deliveries and holds same-amount events without a bank ID", async () => {
  const s = await prisma.paymentEvidenceSource.create({
    data: {
      storeScope: scope,
      kind: "GMAIL_BANK",
      label: "Synthetic blu MIME only",
      accountRef: randomUUID(),
    },
  });
  const lease = (await acquireSourceLease(s.id))!;
  const event = new Date(Date.now() + 120_000 + 7 * 3600_000);
  const months = [
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
  ];
  const time = `${event.getUTCDate()} ${months[event.getUTCMonth()]} ${event.getUTCFullYear()} ${[event.getUTCHours(), event.getUTCMinutes(), event.getUTCSeconds()].map((n) => String(n).padStart(2, "0")).join(":")} WIB`;
  const html = BLU_HTML.replace("14 Nov 2026 10:20:30 WIB", time);
  const raw = syntheticBluEml({ html });
  const input = {
    sourceId: s.id,
    generation: lease.generation,
    leaseToken: lease.token,
    raw,
  };
  const pair = await Promise.all([
    ingestBluEmailReview({ ...input, apiMessageId: "gmailCopyA" }),
    ingestBluEmailReview({ ...input, apiMessageId: "gmailCopyB" }),
  ]);
  expect(pair[0].evidenceId).toBe(pair[1].evidenceId);
  expect(pair[0].disposition).toBe("REVIEW_REQUIRED");
  const e = await prisma.incomingPaymentEvidence.findUniqueOrThrow({
    where: { id: pair[0].evidenceId },
  });
  expect(e).toMatchObject({
    amount: 125001,
    bankTxId: null,
    reason: "MISSING_STABLE_TRANSACTION_ID",
    trusted: false,
    providerStatus: "UNKNOWN",
  });
  const coldClient = new PrismaClient();
  expect(
    await coldClient.incomingPaymentEvidence.count({
      where: { sourceId: s.id },
    }),
  ).toBe(1);
  await coldClient.$disconnect();
  expect(
    (await ingestBluEmailReview({ ...input, apiMessageId: "gmailCopyA" }))
      .evidenceId,
  ).toBe(e.id);
  const sameAmount = await ingestBluEmailReview({
    ...input,
    raw: syntheticBluEml({
      html,
      messageId: "<synthetic-independent-blu@example.test>",
    }),
    apiMessageId: "gmailOther",
  });
  expect(sameAmount.evidenceId).not.toBe(e.id);
  expect(
    await prisma.incomingPaymentEvidence.count({ where: { sourceId: s.id } }),
  ).toBe(2);
  await prisma.paymentEvidenceSource.update({
    where: { id: s.id },
    data: { accountRef: e.accountRef },
  });
  const p = await makePayment(125001);
  const a = await prisma.$transaction((tx) =>
    allocateAttempt(tx, {
      sourceId: s.id,
      paymentId: p.id,
      baseAmount: 125000,
      expiresAt: new Date(now.getTime() + 600_000),
    }),
  );
  // No bank transaction reference or payer-name field is needed to find a match.
  expect((await evidenceCandidateSuggestions(e.id)).map((c) => c.id)).toEqual([
    a.id,
  ]);
  expect(
    (await evidenceCandidateSuggestions(sameAmount.evidenceId)).map(
      (c) => c.id,
    ),
  ).toEqual([a.id]);
  await prisma.incomingPaymentEvidence.update({
    where: { id: e.id },
    data: { occurredAt: a.expiresAt },
  });
  expect(await evidenceCandidateSuggestions(e.id)).toEqual([]);
  await prisma.incomingPaymentEvidence.update({
    where: { id: e.id },
    data: { occurredAt: e.occurredAt, amount: 125002 },
  });
  expect(await evidenceCandidateSuggestions(e.id)).toEqual([]);
  await prisma.incomingPaymentEvidence.update({
    where: { id: e.id },
    data: { amount: 125001 },
  });
  for (const evidenceId of [e.id, sameAmount.evidenceId])
    await expect(
      claimEvidence(
        actor,
        evidenceId,
        a.id,
        "A matching amount alone is not a bank transaction identity.",
      ),
    ).rejects.toThrow("penanganan terpisah");
  expect(
    await prisma.payment.findUnique({ where: { id: p.id } }),
  ).toHaveProperty("status", "PENDING_PAYMENT");
  expect(
    await prisma.paymentEvidenceClaim.count({
      where: { evidence: { sourceId: s.id } },
    }),
  ).toBe(0);
  vi.stubEnv("STORE_INSTALLATION_ID", "foreign-email-store");
  expect(await evidenceCandidateSuggestions(e.id)).toEqual([]);
  await expect(ingestBluEmailReview(input)).rejects.toThrow("tidak ditemukan");
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  await disconnectSource(actor, s.id);
  await expect(ingestBluEmailReview(input)).rejects.toThrow("Lease");
});

it("rejects a foreign tenant, customer management, missing identity and stale workers after disconnect", async () => {
  vi.stubEnv("STORE_INSTALLATION_ID", "other-store-identity");
  await expect(acquireSourceLease(source)).rejects.toThrow("tidak ditemukan");
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  await expect(disconnectSource(customer, source)).rejects.toThrow("izin");
  await expect(
    createSource(actor, {
      kind: "GMAIL_BANK",
      label: "bank fixture",
      accountRef: "missing",
    }),
  ).rejects.toThrow("rekening");
  const previous = await prisma.paymentEvidenceSource.findUniqueOrThrow({
    where: { id: source },
  });
  await disconnectSource(actor, source);
  await expect(
    ingestObservation(
      source,
      previous.generation,
      previous.leaseToken!,
      observation(randomUUID(), 10001),
    ),
  ).rejects.toThrow("Lease");
  expect(
    await prisma.paymentEvidenceClaim.count({
      where: { evidence: { sourceId: source } },
    }),
  ).toBe(1);
  vi.stubEnv("STORE_INSTALLATION_ID", "");
  await expect(acquireSourceLease(source)).rejects.toThrow("Identitas");
});
