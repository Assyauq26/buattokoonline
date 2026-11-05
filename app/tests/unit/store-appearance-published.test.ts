import { afterEach, it, expect, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/modules/appearance/service", () => ({
  readPublishedUncached: read,
}));
import { getPublishedAppearance } from "@/modules/appearance/published";
import { legacyDefault, makeDefault } from "@/modules/appearance/schema";
it("public DB failure uses neutral config and exposes no draft or error", async () => {
  read.mockRejectedValue(new Error("private-database-detail"));
  expect(await getPublishedAppearance()).toEqual({
    config: makeDefault(),
    version: 0,
    legacy: false,
  });
});
it("published DTO contains only the published configuration", async () => {
  const value = { config: legacyDefault(), version: 7, legacy: false };
  read.mockResolvedValue(value);
  expect(await getPublishedAppearance()).toEqual(value);
});

afterEach(() => vi.unstubAllEnvs());
it("fresh self-hosted failure fallback uses the seller name, and saved branding is retained", async () => {
  vi.stubEnv("STORE_NAME", "Kopi Nusantara");
  read.mockRejectedValue(new Error("private"));
  const fresh = await getPublishedAppearance();
  expect(fresh.config.identity.name).toBe("Kopi Nusantara");
  expect(fresh.legacy).toBe(false);
  const saved = { config: legacyDefault(), version: 9, legacy: false };
  saved.config.identity.name = "Merchant edited name";
  read.mockResolvedValue(saved);
  expect(await getPublishedAppearance()).toEqual(saved);
});
it("unconfigured independent stores use neutral branding and invalid names are ignored", async () => {
  vi.stubEnv("STORE_NAME", "bad\nname");
  read.mockRejectedValue(new Error("private"));
  expect((await getPublishedAppearance()).config.identity.name).toBe("Toko Anda");
});
