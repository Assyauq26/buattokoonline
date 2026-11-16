import { describe, expect, it, vi } from "vitest";
import { signSession, verifySessionClaims } from "@/lib/auth/jwt";
import { fashionWindow } from "@/modules/catalog/fashion-window";
import {
  defaultCollections,
  fashionCollectionSchema,
  makeDefault,
  parseAppearance,
} from "@/modules/appearance/schema";
import { selectedCartLines } from "@/modules/checkout/checkout.validation";

describe("Immersive Fashion", () => {
  it("keeps a storefront session scoped to its issuing installation", async () => {
    vi.stubEnv("JWT_SECRET", "local-only-fixture-for-session-issuer-test");
    vi.stubEnv("APP_ORIGIN", "https://store-a.example.invalid");
    try {
      const session = await signSession({ sub: "fixture-buyer", email: "buyer@example.invalid" });
      expect((await verifySessionClaims(session))?.sub).toBe("fixture-buyer");
      vi.stubEnv("APP_ORIGIN", "https://store-b.example.invalid");
      expect(await verifySessionClaims(session)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("retains schema-v1 documents that predate themes", () => {
    const classic = makeDefault();
    delete classic.themeId;
    delete classic.collections;
    expect(parseAppearance(classic).themeId).toBeUndefined();
  });
  it("rejects remote covers, duplicate collection ids and incomplete categories", () => {
    const row = defaultCollections[0];
    expect(
      fashionCollectionSchema.safeParse({
        ...row,
        cover: "https://example.com/cover.jpg",
      }).success,
    ).toBe(false);
    expect(
      fashionCollectionSchema.safeParse({
        ...row,
        source: "category",
        category: "",
      }).success,
    ).toBe(false);
    expect(() =>
      parseAppearance({ ...makeDefault(), collections: [row, row] }),
    ).toThrow();
  });
  it.each([0, 1, 2, 3, 4, 5, 12, 13, 5000])(
    "uses unique, bounded real positions for %i products",
    (total) => {
      for (const index of [0, 1, 12, total - 1]) {
        const window = fashionWindow(total, index);
        expect(window).toHaveLength(Math.min(5, total));
        expect(new Set(window.map((p) => p.pos)).size).toBe(window.length);
        if (total)
          expect(window.find((p) => p.offset === 0)?.pos).toBe(
            Math.max(0, Math.min(index, total - 1)),
          );
      }
    },
  );
  it("validates the selected cart line confirmation", () => {
    for (const invalid of [
      [],
      [""],
      ["x", "x"],
      ["x y"],
      Array.from({ length: 101 }, (_, i) => String(i)),
    ])
      expect(selectedCartLines.safeParse(invalid).success).toBe(false);
    expect(selectedCartLines.parse(["id-a", "id-b"])).toEqual(["id-a", "id-b"]);
  });
});
