import {
  defaultDarkJeansConfig,
  makeDefault,
  makeMandiriPreset,
  parseAppearance,
} from "./schema";
import { foreground, mix } from "./contrast";
const seeds = [
  ["Monochrome", "#111111", "#FFFFFF"],
  ["Toko Online Mandiri", "#111111", "#FFFFFF"],
  ["Immersive Fashion", "#FAF9F6", "#191817"],
  ["Dark Jeans", "#D9AC61", "#080808"],
  ["Midnight Ink", "#D6E4FF", "#101827"],
  ["Sage Studio", "#294D3A", "#F5F8F3"],
  ["Terracotta", "#833F2B", "#FFF8F4"],
  ["Coastal Blue", "#174E80", "#F4F9FF"],
  ["Lavender Edit", "#5B3C83", "#FAF6FF"],
  ["Rose Atelier", "#863C57", "#FFF6F8"],
  ["Sand & Espresso", "#503728", "#FAF5EB"],
  ["Ocean Teal", "#155956", "#F1FAF8"],
  ["Champagne Noir", "#E8D7AF", "#151411"],
];
export const PRESETS = seeds.map(([name, primary, bg], index) => {
  if (index === 0) return { name, config: makeDefault() };
  if (name === "Toko Online Mandiri") return { name, config: makeMandiriPreset() };
  const v = makeDefault(),
    dark = foreground(bg) === "#FFFFFF",
    text = dark ? "#FFFFFF" : "#111111";
  const surface = mix(bg, dark ? "#FFFFFF" : "#000000", 0.025),
    muted = mix(text, bg, 0.2);
  Object.assign(v.colors, {
    pageBg: bg,
    surface,
    card: surface,
    modal: surface,
    modalText: text,
    text,
    secondaryText: muted,
    disabledText: muted,
    primary,
    primaryHover: mix(primary, dark ? "#FFFFFF" : "#000000", 0.12),
    primaryPressed: mix(primary, dark ? "#FFFFFF" : "#000000", 0.2),
    primaryText: foreground(primary),
    secondary: surface,
    secondaryHover: mix(bg, text, 0.06),
    secondaryPressed: mix(bg, text, 0.1),
    secondaryForeground: text,
    accent: primary,
    accentHover: mix(primary, dark ? "#FFFFFF" : "#000000", 0.12),
    accentPressed: mix(primary, dark ? "#FFFFFF" : "#000000", 0.2),
    accentForeground: foreground(primary),
    border: muted,
    link: primary,
    linkHover: primary,
    linkPressed: primary,
    icon: text,
    header: bg,
    headerText: text,
    footer: bg,
    footerText: text,
    nav: bg,
    navText: text,
    navActive: primary,
    navActiveText: foreground(primary),
    badge: primary,
    badgeText: foreground(primary),
    promo: surface,
    promoText: text,
    price: text,
    discount: dark ? "#FFB4B4" : "#A61722",
    info: primary,
    warning: dark ? "#F8D581" : "#805000",
    error: dark ? "#FFB4B4" : "#A61722",
    success: dark ? "#9EE4B4" : "#176B38",
    field: bg,
    fieldText: text,
    focus: primary,
    disabled: surface,
    selected: primary,
    selectedText: foreground(primary),
    outline: bg,
    outlineText: text,
    outlineHover: surface,
    outlinePressed: surface,
  });
  if (name === "Immersive Fashion") {
    v.themeId = "immersive-fashion";
    v.styling.shadow = "none";
    v.styling.button = "soft";
    v.header.links = [
      { id: "baru", label: "Koleksi Baru", href: "/?koleksi=baru", visible: true },
      { id: "katalog", label: "Katalog", href: "/shop", visible: true },
      { id: "bantuan", label: "Bantuan Toko", href: "/account/help", visible: true },
    ];
  }
  if (name === "Dark Jeans") {
    v.themeId = "dark-jeans";
    v.styling.shadow = "soft";
    v.styling.button = "pill";
    v.styling.radius = "round";
    v.header.announcement = "";
    v.header.links = [
      { id: "home", label: "Home", href: "/", visible: true },
      { id: "shop", label: "Shop", href: "/shop", visible: true },
      { id: "category", label: "Kategori", href: "/shop", visible: true },
      { id: "brand", label: "Brand", href: "/shop", visible: true },
      { id: "promo", label: "Promo", href: "/shop?flash=1", visible: true },
    ];
    Object.assign(v.colors, {
      pageBg: "#080808",
      surface: "#111111",
      card: "#111111",
      modal: "#161616",
      header: "#080808",
      footer: "#080808",
      nav: "#080808",
      primary: "#D9AC61",
      accent: "#D9AC61",
      text: "#F5F5F5",
      secondaryText: "#B5B5B5",
      price: "#D9AC61",
      border: "#242428",
    });
    v.darkJeans = defaultDarkJeansConfig();
  }
  return { name, config: parseAppearance(v) };
});
