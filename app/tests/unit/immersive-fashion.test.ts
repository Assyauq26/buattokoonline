import { describe, expect, it, vi } from "vitest";
import { signSession, verifySessionClaims } from "@/lib/auth/jwt";
import { offsetFrom, orbitStyle, orbitPose } from "@/components/fashion/orbit";
import { fashionImage } from "@/modules/catalog/fashion-image";
import { assetIds, usesAsset } from "@/modules/appearance/asset-references";
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
  it("uses the nearest signed orbital distance across both sides of the seam", () => {
    expect(offsetFrom(0,14.75,15)).toBe(.25);
    expect(offsetFrom(14,-.25,15)).toBe(-.75);
    expect(offsetFrom(0,.75,2)).toBe(-.75);
    for (const mobile of [false,true]) {
      expect(orbitStyle(2,4,mobile).opacity).toBe(0);
      expect(orbitStyle(-2,4,mobile).opacity).toBe(0);
      expect(orbitStyle(.4,15,mobile).zIndex).toBe(orbitStyle(-.4,15,mobile).zIndex);
    }
  });
  it.each([false,true])("projects only the front of the Y cylinder with stable vertical orientation",mobile=>{
    expect(orbitPose(0,15,mobile)).toMatchObject({x:0,depth:0,opacity:1});
    for(let d=.05;d<=4;d+=.05){
      const left=orbitPose(-d,15,mobile),right=orbitPose(d,15,mobile);
      expect(left.x).toBeCloseTo(-right.x);
      expect(left.yaw).toBeCloseTo(-right.yaw);
      expect(right.yaw).toBeGreaterThan(0);
      expect(left.depth).toBeCloseTo(right.depth);
      expect(right.depth).toBeLessThan(0);
      expect(Math.abs(right.yaw)).toBeLessThan(32);
      expect(orbitStyle(d,15,mobile).transform).toContain("var(--orbit-drop)");
    }
    expect(orbitPose(2,5,mobile).opacity).toBe(1);
    expect(orbitPose(-2,5,mobile).opacity).toBe(1);
    expect(orbitPose(3,15,mobile).opacity).toBe(0);
  });
  it("selects bounded local photo variants without the private object path",()=>{
    const thumb=fashionImage("/api/v1/product-images/abc?object=path",false);
    expect(thumb.srcSet).toContain("?w=240 240w");
    expect(thumb.srcSet).not.toContain("path");
    expect(thumb.srcSet).not.toContain("1920w");
    expect(fashionImage("blob:example",true)).toEqual({src:"blob:example"});
  });
  it("retains both composition assets and validates positioning limits",()=>{
    const id="b8bc2206-8bc1-44f0-a1cb-db04cb22fbf5";
    const other="e1b836d4-0aa8-4658-81c9-1885d9633752";
    const row={...defaultCollections[0],backgroundId:id,cutoutId:other};
    const config={...makeDefault(),collections:[row]};
    expect(usesAsset(config,other)).toBe(true);
    expect(assetIds(config)).toEqual([id,other]);
    expect(fashionCollectionSchema.safeParse({...row,cutoutId:id}).success).toBe(false);
    expect(fashionCollectionSchema.safeParse({...row,mobile:{x:110,y:50,scale:80}}).success).toBe(false);
  });
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
