import type { CSSProperties } from "react";
import {
  GRADIENT_TARGETS,
  legacyDefault,
  parseAppearance,
  TOKEN_KEYS,
  type StoreAppearanceV1,
} from "./schema";
import { rgb, foreground, mix } from "./contrast";
export function isLegacy(config: StoreAppearanceV1) {
  return JSON.stringify(config) === JSON.stringify(legacyDefault());
}
export function themeStyle(input: StoreAppearanceV1): CSSProperties {
  const v = parseAppearance(input),
    out: Record<string, string> = {};
  if (isLegacy(v)) return {};
  for (const key of TOKEN_KEYS) {
    out[`--store-${key}`] = v.colors[key];
    out[`--store-${key}-rgb`] = rgb(v.colors[key]).join(" ");
  }
  for (const key of ["error", "success"] as const) {
    const fg = foreground(v.colors[key]),
      toward = fg === "#FFFFFF" ? "#000000" : "#FFFFFF";
    out[`--store-${key}-foreground`] = fg;
    out[`--store-${key}-hover`] = mix(v.colors[key], toward, 0.12);
    out[`--store-${key}-pressed`] = mix(v.colors[key], toward, 0.2);
  }
  for (const target of GRADIENT_TARGETS) {
    const g = v.gradients[target];
    if (g.enabled) {
      out[`--store-gradient-${target}`] =
        `linear-gradient(${g.angle}deg, ${g.stops.map((s) => `${s.color} ${s.position}%`).join(", ")})`;
      out[`--store-gradient-${target}-text`] = g.foreground;
      out[`--store-gradient-${target}-fallback`] = g.fallback;
    }
  }
  // Component geometry stays close to the original lightweight storefront.
  // "round" remains customizable, but must not inflate product cards to 24px.
  out["--store-radius"] = { none: "0px", soft: "12px", round: "16px" }[
    v.styling.radius
  ];
  out["--store-media-radius"] = { none: "0px", soft: "10px", round: "12px" }[
    v.styling.radius
  ];
  // Strong --store-border is retained for WCAG form/control boundaries.
  // Decoration (cards/search) uses a lighter blend derived from the chosen
  // palette instead of making every outline look like an input focus ring.
  out["--store-decorative-border"] = mix(v.colors.card, v.colors.border, 0.13);
  out["--store-search-border"] = mix(v.colors.surface, v.colors.border, 0.13);
  out["--store-button-radius"] = {
    square: "0px",
    soft: "10px",
    pill: "9999px",
  }[v.styling.button];
  out["--store-shadow"] = {
    none: "none",
    soft: "0 2px 12px rgb(0 0 0 / .05)",
    raised: "0 8px 28px rgb(0 0 0 / .18)",
  }[v.styling.shadow];
  out["--store-shadow-hover"] = {
    none: "none",
    soft: "0 6px 20px rgb(0 0 0 / .08)",
    raised: "0 12px 32px rgb(0 0 0 / .24)",
  }[v.styling.shadow];
  // The mobile pill needs depth against a similarly colored page, without
  // restoring the heavy structural border. Respect the seller's shadow mode.
  out["--store-nav-shadow"] = {
    none: "none",
    soft: "0 10px 34px rgb(0 0 0 / .17), 0 2px 9px rgb(0 0 0 / .07)",
    raised: "0 14px 40px rgb(0 0 0 / .23), 0 3px 12px rgb(0 0 0 / .10)",
  }[v.styling.shadow];
  out["--store-nav-bar-shadow"] = {
    none: "none",
    soft: "0 -5px 24px rgb(0 0 0 / .08)",
    raised: "0 -8px 30px rgb(0 0 0 / .14)",
  }[v.styling.shadow];
  // Floating chrome has gentler elevation than cards. Derive its tint from
  // the current palette without introducing a persisted appearance setting.
  out["--store-shell-shadow"] = {
    none: "none",
    soft: `0 4px 16px rgb(${rgb(v.colors.navText).join(" ")} / .08)`,
    raised: `0 8px 24px rgb(${rgb(v.colors.navText).join(" ")} / .14)`,
  }[v.styling.shadow];
  out["--font-sans"] =
    v.styling.font === "serif"
      ? "Georgia, serif"
      : "ui-sans-serif, system-ui, sans-serif";
  out["--font-display"] = out["--font-sans"];
  out["--store-font-scale"] = { small: "0.875", normal: "1", large: "1.125" }[
    v.styling.scale
  ];
  out.fontSize = { small: "14px", normal: "16px", large: "18px" }[
    v.styling.scale
  ];
  return out as CSSProperties;
}
