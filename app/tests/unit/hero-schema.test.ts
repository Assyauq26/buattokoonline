
import { describe, it, expect } from "vitest";
import { emptyHero, heroSchema, fallbackHeroSlides } from "@/modules/hero/schema";
const id = "11111111-1111-4111-8111-111111111111";
const sample = {
  id, desktopAssetId: id, mobileAssetId: null,
  alt: "Foto kampanye musim baru", heading: "Koleksi Terbaru", description: "Jelajahi gaya sehari-hari",
  ctaLabel: "Belanja", ctaHref: "/shop", align: "left", tone: "light", overlay: 20,
};
describe("Hero CMS schema", () => {
  it("starts with no borrowed banners before the first publish", () => {
    expect(fallbackHeroSlides).toHaveLength(0);
    expect(emptyHero().slides).toHaveLength(0);
  });
  it("validates safe multi-slide edits and internal CTA", () => {
    expect(heroSchema.safeParse({ schemaVersion: 1, enabled: true, autoplaySeconds: 6, slides: [sample] }).success).toBe(true);
    for (const url of ["//evil.example", "https://evil.example", "javascript:alert(1)", "/admin", "/api/v1"]) {
      expect(heroSchema.safeParse({ schemaVersion: 1, enabled: true, autoplaySeconds: 6, slides: [{ ...sample, ctaHref: url }] }).success).toBe(false);
    }
  });
  it("bounds slides, duplicate IDs, text, autoplay and overlay", () => {
    const base = { schemaVersion: 1, enabled: true, autoplaySeconds: 6 };
    expect(heroSchema.safeParse({ ...base, slides: Array.from({ length: 7 }, (_, i) => ({ ...sample, id: `00000000-0000-4000-8000-${String(i).padStart(12,"0")}` })) }).success).toBe(false);
    expect(heroSchema.safeParse({ ...base, slides: [sample, sample] }).success).toBe(false);
    expect(heroSchema.safeParse({ ...base, slides: [{ ...sample, overlay: 61 }] }).success).toBe(false);
    expect(heroSchema.safeParse({ ...base, autoplaySeconds: 0, slides: [] }).success).toBe(false);
  });
});
