import { normalizeWhatsApp } from "../../lib/store-contact";
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
export const compositionDefaults = {
  mobile: { x: 50, y: 57, scale: 86 },
  desktop: { x: 56, y: 53, scale: 94 },
};
const placement = z.object({
  x: z.number().int().min(20).max(80), y: z.number().int().min(35).max(75),
  scale: z.number().int().min(55).max(110),
}).strict();
export const fashionCollectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: label,
  description: z.string().trim().max(160),
  source: z.enum(["featured", "newest", "bestselling", "category", "flash"]),
  category: z.string().max(100).regex(/^[a-z0-9-]*$/),
  cover: z.string().max(160).regex(/^$|^\/api\/v1\/product-images\/[a-zA-Z0-9_-]+$/),
  backgroundId: z.string().uuid().optional(),
  cutoutId: z.string().uuid().optional(),
  mobile: placement.optional(),
  desktop: placement.optional(),
  mobileFocus: z.number().int().min(0).max(100),
  desktopFocus: z.number().int().min(0).max(100),
}).strict().refine(c => !c.cutoutId || c.cutoutId !== c.backgroundId, "Gunakan latar bersih dan objek yang berbeda").refine(c => c.source !== "category" || !!c.category, "Pilih kategori koleksi");
export type FashionCollection = z.infer<typeof fashionCollectionSchema>;
export const defaultCollections: FashionCollection[] = [
  { id: "pilihan", title: "Koleksi Pilihan", description: "Gaya pilihan untuk setiap hari.", source: "featured" },
  { id: "baru", title: "Produk Terbaru", description: "Temukan koleksi yang baru hadir.", source: "newest" },
  { id: "favorit", title: "Paling Diminati", description: "Jelajahi pilihan favorit.", source: "bestselling" },
  { id: "promo", title: "Flash Sale", description: "", source: "flash" },
].map(c => ({ ...c, source: c.source as FashionCollection["source"], category: "", cover: "", mobileFocus: 24, desktopFocus: 10 }));

export const announcementItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    label: z.string().trim().min(1).max(100),
    icon: z.string().max(40).default("truck"),
    href: z.string().max(240).optional(),
    visible: z.boolean().default(true),
    order: z.number().int().default(0),
  })
  .strict();
export type AnnouncementItem = z.infer<typeof announcementItemSchema>;

export const socialMediaEntrySchema = z
  .object({
    platform: z.enum(["instagram", "tiktok", "youtube", "facebook", "whatsapp"]),
    url: z.string().max(240).refine((val) => {
      if (!val) return true;
      try {
        const u = new URL(val);
        return ["http:", "https:"].includes(u.protocol);
      } catch {
        return false;
      }
    }, "URL media sosial harus menggunakan http:// atau https://"),
    enabled: z.boolean().default(true),
    headerVisible: z.boolean().default(true),
    footerVisible: z.boolean().default(true),
    order: z.number().int().default(0),
  })
  .strict();
export type SocialMediaEntry = z.infer<typeof socialMediaEntrySchema>;

export const darkJeansNewArrivalSchema = z
  .object({
    enabled: z.boolean().default(true),
    eyebrow: z.string().max(40).default("///// NEW ARRIVAL"),
    heading: z.string().max(60).default("New Arrival"),
    highlightedHeading: z.string().max(60).default("Premium Denim"),
    description: z
      .string()
      .max(200)
      .default("Koleksi terbaru dengan kualitas terbaik untuk gaya lebih percaya diri."),
    ctaLabel: z.string().max(40).default("SHOP NOW"),
    ctaHref: z.string().max(240).default("/shop"),
    productSource: z.enum(["newest", "featured", "category"]).default("newest"),
    displayCount: z.number().int().min(1).max(12).default(4),
  })
  .strict();
export type DarkJeansNewArrivalConfig = z.infer<typeof darkJeansNewArrivalSchema>;

export const darkJeansPromoSchema = z
  .object({
    enabled: z.boolean().default(false),
    desktopAssetId: z.string().uuid().nullable().optional(),
    mobileAssetId: z.string().uuid().nullable().optional(),
    altText: z.string().max(120).default("Special Promo"),
    displayMode: z.enum(["artwork", "overlay"]).default("artwork"),
    heading: z.string().max(60).default("DISKON"),
    highlightedDiscount: z.string().max(20).default("50%"),
    description: z.string().max(160).default("UPGRADE STYLE, SAVE MORE!"),
    ctaLabel: z.string().max(40).default("SHOP NOW"),
    ctaHref: z.string().max(240).default("/shop"),
    alignment: z.enum(["left", "center", "right"]).default("left"),
    overlayOpacity: z.number().int().min(0).max(100).default(0),
    campaignId: z.string().optional(),
  })
  .strict();
export type DarkJeansPromoConfig = z.infer<typeof darkJeansPromoSchema>;

export const trustFeatureItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    icon: z.string().max(40).default("diamond"),
    title: z.string().max(60),
    description: z.string().max(100).default(""),
    visible: z.boolean().default(true),
    order: z.number().int().default(0),
  })
  .strict();
export type TrustFeatureItem = z.infer<typeof trustFeatureItemSchema>;

export const footerLinkSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    label: z.string().max(60),
    href: z.string().max(240),
    visible: z.boolean().default(true),
  })
  .strict();
export type FooterLink = z.infer<typeof footerLinkSchema>;

export const darkJeansConfigSchema = z
  .object({
    announcementItems: z.array(announcementItemSchema).max(8).optional(),
    socialLinks: z.array(socialMediaEntrySchema).max(8).optional(),
    newArrival: darkJeansNewArrivalSchema.optional(),
    promoBanner: darkJeansPromoSchema.optional(),
    trustFeatures: z
      .object({
        enabled: z.boolean().default(true),
        items: z.array(trustFeatureItemSchema).max(6).optional(),
        signature: z.string().max(60).optional(),
      })
      .strict()
      .optional(),
    footer: z
      .object({
        quickLinksTitle: z.string().max(40).default("Quick Link"),
        customerCareTitle: z.string().max(40).default("Customer Care"),
        quickLinks: z.array(footerLinkSchema).max(10).optional(),
        customerCare: z.array(footerLinkSchema).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DarkJeansConfig = z.infer<typeof darkJeansConfigSchema>;

export function defaultDarkJeansConfig(): DarkJeansConfig {
  return {
    announcementItems: [
      { id: "ann-1", label: "Gratis Ongkir Min. 200K", icon: "truck", visible: true, order: 0 },
      { id: "ann-2", label: "100% Original Product", icon: "shield", visible: true, order: 1 },
      { id: "ann-3", label: "Mudah Return", icon: "refresh", visible: true, order: 2 },
    ],
    socialLinks: [
      { platform: "tiktok", url: "", enabled: false, headerVisible: true, footerVisible: true, order: 0 },
      { platform: "instagram", url: "", enabled: false, headerVisible: true, footerVisible: true, order: 1 },
      { platform: "youtube", url: "", enabled: false, headerVisible: true, footerVisible: true, order: 2 },
    ],
    newArrival: {
      enabled: true,
      eyebrow: "///// NEW ARRIVAL",
      heading: "New Arrival",
      highlightedHeading: "Premium Denim",
      description: "Koleksi terbaru dengan kualitas terbaik untuk gaya lebih percaya diri.",
      ctaLabel: "SHOP NOW",
      ctaHref: "/shop",
      productSource: "newest",
      displayCount: 4,
    },
    promoBanner: {
      enabled: false,
      altText: "Special Promo",
      displayMode: "artwork",
      heading: "DISKON",
      highlightedDiscount: "50%",
      description: "UPGRADE STYLE, SAVE MORE!",
      ctaLabel: "SHOP NOW",
      ctaHref: "/shop",
      alignment: "left",
      overlayOpacity: 0,
    },
    trustFeatures: {
      enabled: true,
      items: [
        { id: "t-1", icon: "diamond", title: "Premium Quality", description: "Kualitas bahan terbaik", visible: true, order: 0 },
        { id: "t-2", icon: "shield", title: "Secure Payment", description: "Transaksi 100% aman", visible: true, order: 1 },
        { id: "t-3", icon: "truck", title: "Fast Delivery", description: "Pengiriman cepat", visible: true, order: 2 },
        { id: "t-4", icon: "headset", title: "24/7 Support", description: "Bantuan pelanggan", visible: true, order: 3 },
      ],
      signature: "Streetwear Denim Style",
    },
    footer: {
      quickLinksTitle: "Quick Link",
      customerCareTitle: "Customer Care",
      quickLinks: [
        { id: "ql-1", label: "Home", href: "/", visible: true },
        { id: "ql-2", label: "Shop", href: "/shop", visible: true },
        { id: "ql-3", label: "Kategori", href: "/shop", visible: true },
        { id: "ql-4", label: "Brand", href: "/shop", visible: true },
        { id: "ql-5", label: "Promo", href: "/shop?flash=1", visible: true },
      ],
      customerCare: [
        { id: "cc-1", label: "Cara Belanja", href: "/account/help", visible: true },
        { id: "cc-2", label: "Pengiriman", href: "/account/help", visible: true },
        { id: "cc-3", label: "Pembayaran", href: "/account/help", visible: true },
        { id: "cc-4", label: "Retur & Refund", href: "/account/help", visible: true },
        { id: "cc-5", label: "FAQ", href: "/account/help", visible: true },
      ],
    },
  };
}
export const appearanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    themeId: z.enum(["classic", "immersive-fashion", "dark-jeans"]).optional(),
    collections: z.array(fashionCollectionSchema).min(1).max(12)
      .refine(items => new Set(items.map(i => i.id)).size === items.length, "ID koleksi harus unik").optional(),
    darkJeans: darkJeansConfigSchema.optional(),
    identity: z
      .object({
        name: z.string().trim().min(1).max(100),
        tagline: z.string().max(160),
        mode: z.enum(["text", "image", "both"]),
        logoAssetId: z.string().uuid().nullable(),
        logoWidth: z.number().int().min(32).max(240),
        position: z.enum(["left", "center"]),
        description: z.string().max(1000).default(""),
        operationalAddress: z.string().max(1000).default(""),
        serviceHours: z.string().max(200).default(""),
        whatsapp: z
          .string()
          .max(40)
          .transform((v) => (v.trim() ? normalizeWhatsApp(v) || v : ""))
          .refine(
            (v) => !v || !!normalizeWhatsApp(v),
            "Nomor WhatsApp tidak valid",
          )
          .default(""),
        showWhatsApp: z.boolean().default(false),
      })
      .strict()
      .refine(
        (v) => !v.showWhatsApp || !!normalizeWhatsApp(v.whatsapp),
        "Isi nomor WhatsApp valid sebelum menampilkan chat",
      ),
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
  v.identity = {
    ...v.identity,
    name: "Toko Anda",
    tagline: "",
    logoAssetId: null,
    mode: "text",
  };
  v.footer.tagline = "";
  Object.assign(v.colors, {
    surface: "#F7F7F8",
    disabled: "#F7F7F8",
    text: "#111418",
    secondaryText: "#667085",
    disabledText: "#667085",
    primary: "#E1251B",
    primaryHover: "#B3121A",
    primaryPressed: "#931017",
    accent: "#E1251B",
    accentHover: "#B3121A",
    accentPressed: "#931017",
    headerText: "#111418",
    footerText: "#111418",
    navText: "#111418",
    navActive: "#E1251B",
    badge: "#E1251B",
    selected: "#E1251B",
    fieldText: "#111418",
    modalText: "#111418",
    outlineText: "#111418",
    price: "#111418",
    link: "#B3121A",
    linkHover: "#931017",
    linkPressed: "#931017",
    focus: "#B3121A",
  });
  return parseAppearance(v);
}

/** Neutral storefront defaults; existing published palettes remain explicit snapshots. */
export function makeDefault(): StoreAppearanceV1 {
  const v = monochromeDefault();
  v.identity = {
    ...v.identity,
    name: "Toko Anda",
    tagline: "",
    logoAssetId: null,
    mode: "text",
  };
  v.footer.tagline = "";
  v.styling.radius = "soft";
  Object.assign(v.colors, {
    accent: "#111111",
    accentHover: "#242424",
    accentPressed: "#000000",
    link: "#111111",
    linkHover: "#444444",
    linkPressed: "#000000",
    focus: "#111111",
    info: "#444444",
    discount: "#111111",
  });
  return parseAppearance(v);
}
