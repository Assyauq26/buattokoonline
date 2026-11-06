import { z } from "zod";

export const HEX = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Gunakan warna HEX6, misalnya #112233");
export const TOKEN_DEFAULTS = {
  pageBg: "#FFFFFF",
  surface: "#F7F7F7",
  card: "#FFFFFF",
  text: "#111111",
  secondaryText: "#666666",
  disabledText: "#666666",
  primary: "#111111",
  primaryHover: "#242424",
  primaryPressed: "#000000",
  primaryText: "#FFFFFF",
  secondary: "#EEEEEE",
  secondaryHover: "#DDDDDD",
  secondaryPressed: "#CCCCCC",
  secondaryForeground: "#111111",
  accent: "#243C63",
  accentHover: "#1C3050",
  accentPressed: "#15243C",
  accentForeground: "#FFFFFF",
  border: "#767676",
  link: "#174EA6",
  linkPressed: "#0E2F65",
  linkHover: "#123B7D",
  icon: "#444444",
  header: "#FFFFFF",
  headerText: "#111111",
  footer: "#FFFFFF",
  footerText: "#444444",
  nav: "#FFFFFF",
  navText: "#444444",
  navActive: "#111111",
  navActiveText: "#FFFFFF",
  badge: "#111111",
  badgeText: "#FFFFFF",
  promo: "#F1F1F1",
  promoText: "#111111",
  price: "#111111",
  discount: "#A61722",
  info: "#174EA6",
  warning: "#805000",
  error: "#A61722",
  success: "#176B38",
  field: "#FFFFFF",
  fieldText: "#111111",
  focus: "#174EA6",
  disabled: "#EEEEEE",
  selected: "#111111",
  selectedText: "#FFFFFF",
  modal: "#FFFFFF",
  modalText: "#111111",
  outline: "#FFFFFF",
  outlineText: "#111111",
  outlinePressed: "#DDDDDD",
  outlineHover: "#EEEEEE",
} as const;
export type Token = keyof typeof TOKEN_DEFAULTS;
export const TOKEN_KEYS = Object.keys(TOKEN_DEFAULTS) as Token[];
export const TOKEN_LABELS: Record<Token, string> = {
  pageBg: "Latar halaman",
  surface: "Permukaan",
  card: "Latar kartu",
  text: "Teks utama",
  secondaryText: "Teks sekunder",
  disabledText: "Teks nonaktif",
  primary: "Tombol utama",
  primaryHover: "Tombol utama: hover",
  primaryPressed: "Tombol utama: ditekan",
  primaryText: "Teks tombol utama",
  secondary: "Tombol sekunder",
  secondaryHover: "Tombol sekunder: hover",
  secondaryPressed: "Tombol sekunder: ditekan",
  secondaryForeground: "Teks tombol sekunder",
  accent: "Aksen",
  accentHover: "Aksen: hover",
  accentPressed: "Aksen: ditekan",
  accentForeground: "Teks aksen",
  border: "Garis batas",
  link: "Tautan",
  linkHover: "Tautan: hover",
  linkPressed: "Tautan: ditekan",
  icon: "Ikon konten",
  header: "Latar header",
  headerText: "Teks header",
  footer: "Latar footer",
  footerText: "Teks footer",
  nav: "Latar navigasi mobile",
  navText: "Teks navigasi mobile",
  navActive: "Navigasi aktif",
  navActiveText: "Teks navigasi aktif",
  badge: "Latar badge",
  badgeText: "Teks badge",
  promo: "Latar promo",
  promoText: "Teks promo",
  price: "Harga produk",
  discount: "Harga diskon",
  info: "Informasi",
  warning: "Peringatan",
  error: "Kesalahan",
  success: "Berhasil",
  field: "Latar isian",
  fieldText: "Teks isian",
  focus: "Indikator fokus",
  disabled: "Latar nonaktif",
  selected: "Pilihan aktif",
  selectedText: "Teks pilihan aktif",
  modal: "Latar dialog",
  modalText: "Teks dialog",
  outline: "Tombol outline",
  outlineText: "Teks tombol outline",
  outlineHover: "Tombol outline: hover",
  outlinePressed: "Tombol outline: ditekan",
};
const tokenShape = Object.fromEntries(
  TOKEN_KEYS.map((k) => [k, HEX]),
) as Record<Token, typeof HEX>;
export function safeInternalUrl(value: string): boolean {
  if (value.length > 240 || !value.startsWith("/") || value.startsWith("//"))
    return false;
  try {
    const decoded = decodeURIComponent(value);
    if (
      /[\\\s\u0000-\u001f\u007f]/.test(decoded) ||
      decoded.startsWith("//") ||
      /%[0-9a-f]{2}/i.test(decoded)
    )
      return false;
    const u = new URL(value, "https://store.invalid");
    if (
      u.origin !== "https://store.invalid" ||
      decoded.split(/[/?#]/).some((s) => s === ".." || s === ".")
    )
      return false;
    if (
      /^\/(api|admin|store-customize-preview)(\/|$)/i.test(
        decoded.split(/[?#]/)[0],
      )
    )
      return false;
    return !Array.from(u.searchParams.keys()).some((k) =>
      /redirect|return|callback|next|url/i.test(k),
    );
  } catch {
    return false;
  }
}
const label = z.string().trim().min(1).max(60);
const icon = z.enum(["home", "shop", "cart", "account", "heart", "star"]);
export const CORE_HREFS = {
  home: "/",
  shop: "/shop",
  cart: "/cart",
  account: "/account",
} as const;
export const gradientSchema = z
  .object({
    enabled: z.boolean(),
    angle: z.number().int().min(0).max(360),
    stops: z
      .array(
        z
          .object({ color: HEX, position: z.number().int().min(0).max(100) })
          .strict(),
      )
      .min(2)
      .max(4),
    fallback: HEX,
    foreground: HEX,
  })
  .strict()
  .superRefine((g, c) => {
    if (
      g.stops[0].position !== 0 ||
      g.stops.at(-1)?.position !== 100 ||
      g.stops.some((s, i) => i > 0 && s.position <= g.stops[i - 1].position)
    )
      c.addIssue({
        code: "custom",
        message: "Stop harus berurutan dari 0 sampai 100",
      });
  });
export const GRADIENT_TARGETS = [
  "hero",
  "promo",
  "buttons",
  "header",
  "footer",
  "highlightCard",
] as const;
export const appearanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z
      .object({
        name: z.string().trim().min(1).max(100),
        tagline: z.string().max(160),
        mode: z.enum(["text", "image", "both"]),
        logoAssetId: z.string().uuid().nullable(),
        logoWidth: z.number().int().min(32).max(240),
        position: z.enum(["left", "center"]),
      })
      .strict(),
    colors: z.object(tokenShape).strict(),
    gradients: z
      .object(
        Object.fromEntries(
          GRADIENT_TARGETS.map((k) => [k, gradientSchema]),
        ) as Record<(typeof GRADIENT_TARGETS)[number], typeof gradientSchema>,
      )
      .strict(),
    header: z
      .object({
        layout: z.enum(["classic", "centered", "compact"]),
        sticky: z.boolean(),
        search: z.boolean(),
        wishlist: z.boolean(),
        announcement: z.string().max(160),
        links: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z0-9-]{1,40}$/),
                label,
                href: z
                  .string()
                  .refine(safeInternalUrl, "URL internal tidak aman"),
                visible: z.boolean(),
              })
              .strict(),
          )
          .max(10),
      })
      .strict(),
    mobile: z
      .object({
        style: z.enum(["pill", "bar"]),
        items: z
          .array(
            z
              .object({
                id: z.enum(["home", "shop", "cart", "account"]),
                label,
                icon,
              })
              .strict(),
          )
          .length(4),
      })
      .strict(),
    footer: z
      .object({
        showLogo: z.boolean(),
        trustFeatures: z.boolean(),
        tagline: z.string().max(160),
      })
      .strict(),
    styling: z
      .object({
        radius: z.enum(["none", "soft", "round"]),
        shadow: z.enum(["none", "soft", "raised"]),
        button: z.enum(["square", "soft", "pill"]),
        font: z.enum(["system", "serif"]),
        scale: z.enum(["small", "normal", "large"]),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.mobile.items.map((i) => i.id)).size !== 4)
      c.addIssue({
        code: "custom",
        path: ["mobile"],
        message: "Home, Shop, Cart, Account wajib tersedia tepat satu kali",
      });
    if (new Set(v.header.links.map((i) => i.id)).size !== v.header.links.length)
      c.addIssue({
        code: "custom",
        path: ["header"],
        message: "ID menu harus unik",
      });
    if (new TextEncoder().encode(JSON.stringify(v)).length > 32768)
      c.addIssue({ code: "custom", message: "Theme maksimal 32 KiB" });
  });
export type StoreAppearanceV1 = z.infer<typeof appearanceSchema>;
export function parseAppearance(value: unknown): StoreAppearanceV1 {
  return appearanceSchema.parse(value);
}
function monochromeDefault(): StoreAppearanceV1 {
  const gradient = {
    enabled: false,
    angle: 90,
    stops: [
      { color: "#111111", position: 0 },
      { color: "#333333", position: 100 },
    ],
    fallback: "#111111",
    foreground: "#FFFFFF",
  };
  return parseAppearance({
    schemaVersion: 1,
    identity: {
      name: "Toko Anda",
      tagline: "",
      mode: "text",
      logoAssetId: null,
      logoWidth: 120,
      position: "left",
    },
    colors: { ...TOKEN_DEFAULTS },
    gradients: Object.fromEntries(
      GRADIENT_TARGETS.map((k) => [k, structuredClone(gradient)]),
    ),
    header: {
      layout: "classic",
      sticky: true,
      search: true,
      wishlist: true,
      announcement: "",
      links: [
        { id: "home", label: "Home", href: "/", visible: true },
        { id: "shop", label: "Shop", href: "/shop", visible: true },
        { id: "category", label: "Kategori", href: "/shop", visible: true },
        { id: "brand", label: "Brand", href: "/shop", visible: true },
        { id: "promo", label: "Promo", href: "/shop?flash=1", visible: true },
      ],
    },
    mobile: {
      style: "pill",
      items: [
        { id: "home", label: "Home", icon: "home" },
        { id: "shop", label: "Shop", icon: "shop" },
        { id: "cart", label: "Keranjang", icon: "cart" },
        { id: "account", label: "Account", icon: "account" },
      ],
    },
    footer: {
      showLogo: true,
      trustFeatures: true,
      tagline: "",
    },
    styling: {
      radius: "round",
      shadow: "soft",
      button: "pill",
      font: "system",
      scale: "normal",
    },
  });
}
/** Compatibility is a read fallback, never an implicit publishable preset. */
export function legacyDefault(): StoreAppearanceV1 {
  const v = monochromeDefault();
  Object.assign(v.colors, {
    secondaryText: "#666666",
    disabledText: "#999999",
    border: "#E5E5E5",
    link: "#111111",
    linkHover: "#2563EB",
    primary: "#000000",
    primaryHover: "#111111",
  });
  return v;
}

/** New/reset drafts only. Never rewrite an existing published config or legacy revision. */
export function makeMandiriPreset(): StoreAppearanceV1 {
  const v = monochromeDefault();
  v.identity = { ...v.identity, name: "Toko Anda", tagline: "", logoAssetId: null, mode: "text" };
  v.footer.tagline = "";
  Object.assign(v.colors, {
    surface: "#F7F7F8", disabled: "#F7F7F8", text: "#111418", secondaryText: "#667085", disabledText: "#667085",
    primary: "#E1251B", primaryHover: "#B3121A", primaryPressed: "#931017",
    accent: "#E1251B", accentHover: "#B3121A", accentPressed: "#931017",
    headerText: "#111418", footerText: "#111418", navText: "#111418",
    navActive: "#E1251B", badge: "#E1251B", selected: "#E1251B",
    fieldText: "#111418", modalText: "#111418", outlineText: "#111418", price: "#111418",
    link: "#B3121A", linkHover: "#931017", linkPressed: "#931017", focus: "#B3121A"
  });
  return parseAppearance(v);
}

/** Neutral storefront defaults; existing published palettes remain explicit snapshots. */
export function makeDefault(): StoreAppearanceV1 {
  const v = monochromeDefault();
  v.identity = { ...v.identity, name: "Toko Anda", tagline: "", logoAssetId: null, mode: "text" };
  v.footer.tagline = "";
  v.styling.radius = "soft";
  Object.assign(v.colors, {
    accent: "#111111", accentHover: "#242424", accentPressed: "#000000",
    link: "#111111", linkHover: "#444444", linkPressed: "#000000",
    focus: "#111111", info: "#444444", discount: "#111111",
  });
  return parseAppearance(v);
}
