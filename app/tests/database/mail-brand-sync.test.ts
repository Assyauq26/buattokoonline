import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "@/lib/prisma";
import { changeAppearance, readDraft } from "@/modules/appearance/service";
import { makeDefault } from "@/modules/appearance/schema";
import { syncPendingMailBrand } from "@/modules/auth/mail-brand-sync";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/management_v130_test")
  throw Error("Local disposable DB only");
let actor: string;
beforeAll(async () => {
  actor = (await prisma.user.create({
    data: { name: "Sync test", email: randomUUID() + "@example.test", passwordHash: "local-only" },
  })).id;
  await prisma.storeMailBrandSync.deleteMany();
  await prisma.storeAppearanceRevision.deleteMany();
  const config = makeDefault();
  await prisma.storeAppearance.upsert({
    where: { key: "primary" },
    create: { key: "primary", draft: config, published: config },
    update: { draft: config, published: config, draftVersion: 0, publishedVersion: 0 },
  });
  vi.stubEnv("STORE_MAIL_RELAY_TOKEN", "a".repeat(64));
  vi.stubEnv("APP_ORIGIN", "https://sync.example.test");
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});
async function publish(name: string) {
  const state = await readDraft();
  const saved = await changeAppearance({
    kind: "save", draftVersion: state.draftVersion, publishedVersion: state.publishedVersion,
    config: { ...state.config, identity: { ...state.config.identity, name } },
  }, actor, "test-session");
  return changeAppearance({
    kind: "publish", draftVersion: saved.draftVersion, publishedVersion: saved.publishedVersion,
  }, actor, "test-session");
}
it("commits names and an event together while offline, retries with backoff, and fences late acknowledgments", async () => {
  await publish("Nama Pertama");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await syncPendingMailBrand();
  let event = await prisma.storeMailBrandSync.findUniqueOrThrow({ where: { id: 1 } });
  expect(event.status).toBe("unavailable");
  expect(event.attempts).toBe(1);
  expect(event.nextAttempt.getTime()).toBeGreaterThan(Date.now());
  expect((await readDraft()).publishedConfig.identity.name).toBe("Nama Pertama");
  await syncPendingMailBrand();
  expect(fetch).toHaveBeenCalledOnce();

  let finish!: (value: Response) => void;
  const pendingResponse = new Promise<Response>(resolve => { finish = resolve; });
  let started!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
    started();
    return pendingResponse;
  }));
  await prisma.storeMailBrandSync.update({ where: { id: 1 }, data: { nextAttempt: new Date(0) } });
  const oldWorker = syncPendingMailBrand();
  await requestStarted;
  await publish("Nama Kedua");
  finish(Response.json({ brand: "Nama Pertama" }));
  await oldWorker;
  event = await prisma.storeMailBrandSync.findUniqueOrThrow({ where: { id: 1 } });
  expect(event.name).toBe("Nama Kedua");
  expect(event.syncedAt).toBeNull();
  const deliver = vi.fn().mockResolvedValue(Response.json({ brand: "Nama Kedua" }));
  vi.stubGlobal("fetch", deliver);
  await Promise.all([syncPendingMailBrand(), syncPendingMailBrand()]);
  expect(deliver).toHaveBeenCalledOnce();
  event = await prisma.storeMailBrandSync.findUniqueOrThrow({ where: { id: 1 } });
  expect(event.syncedAt).toBeInstanceOf(Date);
  expect(JSON.parse(deliver.mock.calls[0][1].body)).toMatchObject({ name: "Nama Kedua", revision: 2 });
});
it("stale publishing cannot enqueue or overwrite an event", async () => {
  const before = await prisma.storeMailBrandSync.findUniqueOrThrow({ where: { id: 1 } });
  await expect(changeAppearance({
    kind: "publish", draftVersion: 0, publishedVersion: 0,
  }, actor, "test-session")).rejects.toMatchObject({ status: 409 });
  expect(await prisma.storeMailBrandSync.findUniqueOrThrow({ where: { id: 1 } })).toEqual(before);
});
