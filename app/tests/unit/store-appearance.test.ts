import { describe, it, expect } from "vitest";
import {
  appearanceSchema,
  makeDefault,
  legacyDefault,
  safeInternalUrl,
  TOKEN_KEYS,
} from "@/modules/appearance/schema";
import { PRESETS } from "@/modules/appearance/presets";
import {
  contrast,
  contrastErrors,
  foreground,
} from "@/modules/appearance/contrast";
import { themeStyle, isLegacy } from "@/modules/appearance/runtime";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { resolveStorageObject } from "@/lib/storage-path";
describe("store appearance contract", () => {
  it("all ten complete presets pass AA", () => {
    expect(PRESETS).toHaveLength(10);
    for (const p of PRESETS) {
      expect(appearanceSchema.safeParse(p.config).success, p.name).toBe(true);
      expect(Object.keys(p.config.colors)).toHaveLength(TOKEN_KEYS.length);
      expect(contrastErrors(p.config), p.name).toEqual([]);
    }
  });
  it("legacy has exact compatibility path, no implicit CSS activation", () => {
    expect(isLegacy(legacyDefault())).toBe(true);
    expect(themeStyle(legacyDefault())).toEqual({});
    expect(contrastErrors(legacyDefault()).length).toBeGreaterThan(0);
    expect(contrastErrors(makeDefault())).toEqual([]);
  });
  it("published Monochrome keeps discreet card and search decoration", () => {
    const config = PRESETS[0].config;
    const style = themeStyle(config) as unknown as Record<string, string>;
    // Accessible form controls still use the high-contrast border token.
    expect(contrast(config.colors.border, config.colors.field)).toBeGreaterThanOrEqual(3);
    // Decorative outlines must not inherit that strong border as a solid line.
    expect(contrast(style["--store-decorative-border"], config.colors.card)).toBeLessThan(2);
    expect(contrast(style["--store-search-border"], config.colors.surface)).toBeLessThan(2);
    expect(style["--store-radius"]).toBe("16px");
    expect(style["--store-media-radius"]).toBe("12px");
    expect(style["--store-shadow"]).toContain("/ .05");
    expect(style["--store-shadow-hover"]).toContain("/ .08");
    const soft = structuredClone(config);
    soft.styling.radius = "soft";
    expect(themeStyle(soft)).toHaveProperty("--store-radius", "12px");
    expect(themeStyle(soft)).toHaveProperty("--store-media-radius", "10px");
    const none = structuredClone(config);
    none.styling.radius = "none";
    none.styling.shadow = "none";
    expect(themeStyle(none)).toHaveProperty("--store-radius", "0px");
    expect(themeStyle(none)).toHaveProperty("--store-shadow", "none");
  });
  it.each(["none", "soft", "raised"] as const)(
    "floating shell elevation follows %s without changing saved data or card tokens",
    (shadow) => {
      for (const preset of PRESETS) {
        const config = structuredClone(preset.config);
        config.styling.shadow = shadow;
        const before = JSON.stringify(config);
        const style = themeStyle(config);
        expect(JSON.stringify(config)).toBe(before);
        expect(style).toHaveProperty("--store-border", config.colors.border);
        expect(style).toHaveProperty("--store-nav-shadow", {
          none: "none",
          soft: "0 10px 34px rgb(0 0 0 / .17), 0 2px 9px rgb(0 0 0 / .07)",
          raised: "0 14px 40px rgb(0 0 0 / .23), 0 3px 12px rgb(0 0 0 / .10)",
        }[shadow]);
        expect(style).toHaveProperty("--store-nav-bar-shadow", {
          none: "none",
          soft: "0 -5px 24px rgb(0 0 0 / .08)",
          raised: "0 -8px 30px rgb(0 0 0 / .14)",
        }[shadow]);
        expect(style).toHaveProperty("--store-shell-shadow", {
          none: "none",
          soft: `0 4px 16px rgb(${config.colors.navText.match(/[a-f\d]{2}/gi)!.map((channel) => parseInt(channel, 16)).join(" ")} / .08)`,
          raised: `0 8px 24px rgb(${config.colors.navText.match(/[a-f\d]{2}/gi)!.map((channel) => parseInt(channel, 16)).join(" ")} / .14)`,
        }[shadow]);
        if (shadow === "soft") expect(style).toHaveProperty("--store-shadow", "0 2px 12px rgb(0 0 0 / .05)");
      }
    },
  );
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/%252f%252fevil.test",
    "/shop?redirect=https://evil.test",
    "/api/v1/admin",
    "/%61dmin",
    "/%61pi%2fv1",
    "/admin",
    "/../shop",
    "/%2e%2e/shop",
    "/shop\n",
  ])("rejects unsafe URL %s", (url) =>
    expect(safeInternalUrl(url)).toBe(false),
  );
  it.each([
    "/",
    "/shop",
    "/shop?flash=1",
    "/syarat-ketentuan",
    "/kebijakan-privasi",
  ])("allows internal URL %s", (url) =>
    expect(safeInternalUrl(url)).toBe(true),
  );
  it("rejects unknown schema, keys, color injection, non-hex", () => {
    for (const patch of [
      { schemaVersion: 2 },
      { css: "body{}" },
      { colors: { ...makeDefault().colors, text: "red;display:none" } },
      {
        identity: {
          ...makeDefault().identity,
          logoAssetId: "https://evil.test/logo.png",
        },
      },
    ])
      expect(
        appearanceSchema.safeParse({ ...makeDefault(), ...patch }).success,
      ).toBe(false);
  });
  it("requires core navigation exactly once", () => {
    const v = makeDefault();
    v.mobile.items[0] = v.mobile.items[1];
    expect(appearanceSchema.safeParse(v).success).toBe(false);
  });
  it("validates gradient stops and sampled contrast", () => {
    const v = makeDefault();
    v.gradients.buttons.enabled = true;
    expect(contrastErrors(v)).toEqual([]);
    v.gradients.buttons.stops.splice(1, 0, { color: "#FFFFFF", position: 50 });
    expect(contrastErrors(v).some((e) => e.includes("buttons"))).toBe(true);
    v.gradients.buttons.stops[1].position = 100;
    expect(appearanceSchema.safeParse(v).success).toBe(false);
  });
  it("known WCAG contrast values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBe(21);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
  });
  it("only Admin and Super Admin granted Customize", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS))
      expect(
        permissions.includes(PERMISSIONS.STORE_CUSTOMIZE_PUBLISH),
        role,
      ).toBe(["Admin", "Super Admin"].includes(role));
  });
  it("separate branding storage cannot contain PDF/traversal", () => {
    expect(
      resolveStorageObject(
        "app/store-branding/owner/00000000-0000-0000-0000-000000000000.webp",
        "app",
      ).bucket,
    ).toBe("store-branding");
    expect(() =>
      resolveStorageObject(
        "app/store-branding/owner/00000000-0000-0000-0000-000000000000.pdf",
        "app",
      ),
    ).toThrow();
    expect(() =>
      resolveStorageObject(
        "app/store-branding/../00000000-0000-0000-0000-000000000000.webp",
        "app",
      ),
    ).toThrow();
  });
  it("mapper produces only validated tokens and generated gradient", () => {
    const v = makeDefault();
    v.gradients.buttons.enabled = true;
    const style = themeStyle(v);
    expect(
      Object.keys(style).every(
        (k) =>
          k.startsWith("--store-") ||
          ["--font-sans", "--font-display", "fontSize"].includes(k),
      ),
    ).toBe(true);
    expect(style).toHaveProperty("--store-gradient-buttons");
  });
});

it("generated semantic button foregrounds remain AA through hover and pressed", () => {
  for (const preset of PRESETS) {
    const style = themeStyle(preset.config) as unknown as Record<
      string,
      string
    >;
    for (const key of ["error", "success"] as const) {
      const fg = style[`--store-${key}-foreground`];
      for (const bg of [
        preset.config.colors[key],
        style[`--store-${key}-hover`],
        style[`--store-${key}-pressed`],
      ])
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

it("automatic foreground meets AA throughout the grayscale boundary", () => {
  for (let n = 0; n < 256; n++) {
    const bg = "#" + n.toString(16).padStart(2, "0").repeat(3);
    expect(contrast(foreground(bg), bg)).toBeGreaterThanOrEqual(4.5);
  }
});

it("rejects low contrast inside a narrow gradient interval", () => {
  const v = makeDefault();
  v.gradients.buttons = {
    enabled: true,
    angle: 90,
    fallback: "#000000",
    foreground: "#767676",
    stops: [
      { color: "#000000", position: 0 },
      { color: "#000000", position: 49 },
      { color: "#FFFFFF", position: 50 },
      { color: "#FFFFFF", position: 100 },
    ],
  };
  expect(appearanceSchema.safeParse(v).success).toBe(true);
  expect(contrastErrors(v).some((error) => error.includes("buttons"))).toBe(
    true,
  );
});
