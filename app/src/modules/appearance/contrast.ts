import {
  GRADIENT_TARGETS,
  type StoreAppearanceV1,
  type Token,
  TOKEN_LABELS,
} from "./schema";
export function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
function luminance(hex: string) {
  return rgb(hex)
    .map((n) => n / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function foreground(bg: string) {
  return contrast(bg, "#FFFFFF") >= contrast(bg, "#000000")
    ? "#FFFFFF"
    : "#000000";
}
export function mix(a: string, b: string, t: number) {
  return (
    "#" +
    rgb(a)
      .map((n, i) =>
        Math.round(n + (rgb(b)[i] - n) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const CONTRAST_PAIRS: [Token, Token, number][] = [
  ...["pageBg", "surface", "card", "modal"].flatMap((bg) =>
    (["text", "secondaryText", "disabledText"] as Token[]).map(
      (fg) => [fg, bg, 4.5] as [Token, Token, number],
    ),
  ),
  ["primaryText", "primary", 4.5],
  ["primaryText", "primaryHover", 4.5],
  ["primaryText", "primaryPressed", 4.5],
  ["secondaryForeground", "secondary", 4.5],
  ["secondaryForeground", "secondaryHover", 4.5],
  ["secondaryForeground", "secondaryPressed", 4.5],
  ["accentForeground", "accent", 4.5],
  ["accentForeground", "accentHover", 4.5],
  ["accentForeground", "accentPressed", 4.5],
  ["headerText", "header", 4.5],
  ["footerText", "footer", 4.5],
  ["navText", "nav", 4.5],
  ["navActiveText", "navActive", 4.5],
  ["badgeText", "badge", 4.5],
  ["promoText", "promo", 4.5],
  ["fieldText", "field", 4.5],
  ["secondaryText", "field", 4.5],
  ["disabledText", "field", 4.5],
  ["icon", "field", 3],
  ["selected", "card", 3],
  ["navActive", "nav", 3],
  ["selectedText", "selected", 4.5],
  ["outlineText", "outline", 4.5],
  ["outlineText", "outlineHover", 4.5],
  ["outlineText", "outlinePressed", 4.5],
  ["modalText", "modal", 4.5],
  ...(
    [
      "link",
      "linkHover",
      "linkPressed",
      "price",
      "discount",
      "info",
      "warning",
      "error",
      "success",
    ] as Token[]
  ).flatMap((fg) =>
    (["pageBg", "surface", "card", "modal"] as Token[]).map(
      (bg) => [fg, bg, 4.5] as [Token, Token, number],
    ),
  ),
  ["icon", "pageBg", 3],
  ["icon", "surface", 3],
  ["icon", "card", 3],
  ["focus", "pageBg", 3],
  ["focus", "surface", 3],
  ["focus", "field", 3],
  ["focus", "promo", 3],
  ["focus", "card", 3],
  ["focus", "modal", 3],
  ["focus", "header", 3],
  ["focus", "footer", 3],
  ["focus", "nav", 3],
  ["border", "card", 3],
  ["border", "field", 3],
  ["disabledText", "disabled", 4.5],
];
export function contrastErrors(v: StoreAppearanceV1): string[] {
  const errors = CONTRAST_PAIRS.filter(
    ([fg, bg, min]) => contrast(v.colors[fg], v.colors[bg]) < min,
  ).map(
    ([fg, bg, min]) =>
      `${TOKEN_LABELS[fg]} / ${TOKEN_LABELS[bg]}: perlu kontras ${min}:1`,
  );
  for (const target of GRADIENT_TARGETS) {
    const g = v.gradients[target];
    if (!g.enabled) continue;
    const positions = [
      ...Array.from({ length: 11 }, (_, i) => i * 10),
      ...g.stops.map((s) => s.position),
      // Sample each interval too: a 1% transition can fall between global samples.
      ...g.stops
        .slice(1)
        .flatMap((stop, index) =>
          Array.from(
            { length: 11 },
            (_, sample) =>
              g.stops[index].position +
              ((stop.position - g.stops[index].position) * sample) / 10,
          ),
        ),
    ];
    const samples = positions.map((p) => {
      const right = g.stops.findIndex((s) => s.position >= p);
      if (right <= 0) return g.stops[0].color;
      const a = g.stops[right - 1],
        b = g.stops[right];
      return mix(
        a.color,
        b.color,
        (p - a.position) / (b.position - a.position),
      );
    });
    if ([...samples, g.fallback].some((bg) => contrast(g.foreground, bg) < 4.5))
      errors.push(
        `Gradasi ${target}: teks perlu kontras 4.5:1 pada semua stop/sampel`,
      );
  }
  return errors;
}
