import { createHash, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { runBluWorker } from "@/modules/payments/evidence/blu-worker";
import { seal } from "@/modules/payments/evidence/secrets";
import * as google from "@/modules/payments/evidence/google";
import * as dkim from "@/modules/payments/evidence/blu-dkim";
import { syntheticBluEml } from "../fixtures/blu-email";

const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (target.hostname !== "127.0.0.1" || !["5568", "5432"].includes(target.port) || target.pathname !== "/hubify_payment_evidence_test")
  throw new Error("Exact isolated blu worker database required");
const scope = `blu-worker-${randomUUID()}`;
let actor: string, sourceId: string, message: string;
const tokens = () => ({ access: "synthetic-access", refresh: "synthetic-refresh", expiresAt: Date.now() + 3600000 });
beforeAll(async () => {
  vi.stubEnv("STORE_INSTALLATION_ID", scope); vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "true");
  vi.stubEnv("PAYMENT_BLU_CHECKOUT_ENABLED", "true"); vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
  vi.stubEnv("PAYMENT_GOOGLE_CLIENT_ID", "synthetic-client.apps.googleusercontent.com"); vi.stubEnv("PAYMENT_GOOGLE_CLIENT_SECRET", "synthetic-only-not-a-secret");
  vi.stubEnv("PAYMENT_INTEGRATION_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  const role = await prisma.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Synthetic owner" }, update: {} });
  for (const key of ["bank.manage", "payment.read"]) {
    const p = await prisma.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  actor = (await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name: "Synthetic owner", passwordHash: "disabled", roles: { create: { roleId: role.id } } } })).id;
  vi.stubEnv("PAYMENT_EVIDENCE_ADMIN_IDS", actor);
  const bank = await prisma.bankAccount.create({ data: { bankName: "Synthetic blu", displayName: "Fixture", accountHolder: "Fixture", accountNumber: "000011112222" } });
  sourceId = (await prisma.paymentEvidenceSource.create({ data: { storeScope: scope, kind: "GMAIL_BANK", label: "Worker fixture",
    bankAccountId: bank.id, accountRef: createHash("sha256").update(JSON.stringify(["IDR", bank.accountNumber])).digest("hex") } })).id;
});
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", () => { throw new Error("External network is forbidden in worker tests"); });
  message = randomUUID();
  await prisma.user.update({ where: { id: actor }, data: { isActive: true } });
  await prisma.paymentEvidenceSource.update({ where: { id: sourceId }, data: { enabled: true, automationActorId: actor,
    health: "REVIEW_ONLY", generation: { increment: 1 }, failures: 0, nextPollAt: null, leaseUntil: null, leaseToken: null, cursor: null,
    encryptedSecret: seal(JSON.stringify(tokens()), scope, sourceId, "google-tokens") } });
  vi.spyOn(google, "refreshGoogle").mockResolvedValue(tokens());
  vi.spyOn(google, "listGmailMessages").mockResolvedValue({ messages: [{ id: message }] });
  vi.spyOn(google, "getGmailRawMessage").mockImplementation(async (_access, id) => ({ apiMessageId: id,
    raw: Buffer.from(syntheticBluEml({ messageId: `<${id}@example.test>` })) }));
  vi.spyOn(dkim, "verifyBluDkim").mockImplementation(async raw => ({ format: 1,
    rawSha256: createHash("sha256").update(raw).digest("hex"), verified: true, code: "BANK_DKIM_VALID" }));
});
afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await prisma.$disconnect(); });
it("runs without buyer sessions/tabs and persists bounded pagination across ticks", async () => {
  vi.mocked(google.listGmailMessages).mockResolvedValueOnce({ messages: [{ id: message }], nextPageToken: "synthetic-page-2" });
  const first = await runBluWorker(); expect(first.read).toBe(1);
  const saved = await prisma.paymentEvidenceSource.findUniqueOrThrow({ where: { id: sourceId } });
  expect(JSON.parse(saved.cursor!).page).toBe("synthetic-page-2");
  expect(saved.leaseToken).toBeNull(); expect(saved.nextPollAt!.getTime()).toBeGreaterThan(Date.now());
  expect((await runBluWorker()).read).toBe(0);
  await prisma.paymentEvidenceSource.update({ where: { id: sourceId }, data: { nextPollAt: new Date(0) } });
  vi.mocked(google.listGmailMessages).mockResolvedValueOnce({ messages: [] });
  await runBluWorker();
  expect(vi.mocked(google.listGmailMessages).mock.calls.at(-1)?.[2]).toBe("synthetic-page-2");
  expect((await prisma.paymentEvidenceSource.findUniqueOrThrow({ where: { id: sourceId } })).cursor).toBe("");
  expect(await prisma.paymentEvidenceClaim.count({ where: { evidence: { sourceId } } })).toBe(0);
});
it("parallel worker calls share a source lease rather than polling once per caller", async () => {
  vi.mocked(google.listGmailMessages).mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 30)); return { messages: [{ id: message }] };
  });
  const results = await Promise.all([runBluWorker(), runBluWorker()]);
  expect(results.reduce((n,r) => n + r.read, 0)).toBe(1);
  expect(google.listGmailMessages).toHaveBeenCalledTimes(1);
});
it("network failure keeps the cursor, backs off and never marks financial settlement", async () => {
  const cursor = JSON.stringify({ since: Date.now() - 3600000, page: "synthetic-resume" });
  await prisma.paymentEvidenceSource.update({ where: { id: sourceId }, data: { cursor } });
  vi.mocked(google.listGmailMessages).mockRejectedValueOnce(new HttpError("Synthetic provider error", 503));
  expect((await runBluWorker()).failed).toBe(1);
  const s = await prisma.paymentEvidenceSource.findUniqueOrThrow({ where: { id: sourceId } });
  expect(s).toMatchObject({ cursor, failures: 1, health: "TEMPORARILY_UNAVAILABLE", leaseToken: null });
  expect(+s.nextPollAt!).toBeGreaterThan(Date.now() + 50000);
});
it("token revocation blocks new checkout and requests reconnect without exposing provider details", async () => {
  vi.mocked(google.refreshGoogle).mockRejectedValueOnce(new HttpError("Synthetic invalid grant", 409));
  const result = await runBluWorker(); expect(result.failed).toBe(1);
  expect(JSON.stringify(result)).not.toContain("invalid grant");
  expect((await prisma.paymentEvidenceSource.findUniqueOrThrow({ where: { id: sourceId } })).health).toBe("RECONNECT_REQUIRED");
  expect(google.listGmailMessages).not.toHaveBeenCalled();
});
it("disconnect during a read fences the old generation and cannot resurrect credentials", async () => {
  vi.mocked(google.getGmailRawMessage).mockImplementationOnce(async (_access, id) => {
    await prisma.paymentEvidenceSource.update({ where: { id: sourceId }, data: { generation: { increment: 1 },
      enabled: false, automationActorId: null, encryptedSecret: null, leaseToken: null, leaseUntil: null, health: "DISCONNECTED" } });
    return { apiMessageId: id, raw: Buffer.from(syntheticBluEml({ messageId: `<${id}@example.test>` })) };
  });
  const before = await prisma.incomingPaymentEvidence.count({ where: { sourceId } });
  await runBluWorker();
  expect(await prisma.incomingPaymentEvidence.count({ where: { sourceId } })).toBe(before);
  expect(await prisma.paymentEvidenceSource.findUniqueOrThrow({ where: { id: sourceId } })).toMatchObject({ enabled: false, encryptedSecret: null, health: "DISCONNECTED" });
});
it("revoking staff access disables the worker and method before reading Gmail", async () => {
  await prisma.user.update({ where: { id: actor }, data: { isActive: false } });
  await runBluWorker();
  expect(google.refreshGoogle).not.toHaveBeenCalled();
  expect(await prisma.paymentEvidenceSource.findUniqueOrThrow({ where: { id: sourceId } })).toMatchObject({ enabled: false, automationActorId: null });
});
