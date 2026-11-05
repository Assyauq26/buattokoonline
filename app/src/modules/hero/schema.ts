
import { z } from "zod";
import { safeInternalUrl } from "@/modules/appearance/schema";

const uuid = z.string().uuid();
export const heroSlideSchema = z.object({
  id: uuid,
  desktopAssetId: uuid.nullable(),
  mobileAssetId: uuid.nullable(),
  alt: z.string().trim().min(3).max(160),
  heading: z.string().trim().max(100),
  description: z.string().trim().max(220),
  ctaLabel: z.string().trim().max(36),
  ctaHref: z.string().trim().max(240),
  align: z.enum(["left", "center", "right"]),
  tone: z.enum(["light", "dark"]),
  overlay: z.number().int().min(0).max(60),
}).strict().superRefine((slide, context) => {
  if (slide.ctaLabel && !safeInternalUrl(slide.ctaHref))
    context.addIssue({ code: "custom", path: ["ctaHref"], message: "Tautan tombol harus path internal toko yang aman" });
  if (!slide.ctaLabel && slide.ctaHref)
    context.addIssue({ code: "custom", path: ["ctaHref"], message: "Isi label tombol atau kosongkan tautan" });
});
export const heroSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  autoplaySeconds: z.number().int().min(3).max(15),
  slides: z.array(heroSlideSchema).max(6),
}).strict().superRefine((config, context) => {
  if (new Set(config.slides.map(slide => slide.id)).size !== config.slides.length)
    context.addIssue({ code: "custom", path: ["slides"], message: "ID slide harus unik" });
});
export type HeroConfig = z.infer<typeof heroSchema>;
export type HeroSlideConfig = HeroConfig["slides"][number];
export const emptyHero = (): HeroConfig => ({
  schemaVersion: 1, enabled: false, autoplaySeconds: 6, slides: [],
});
export const parseHero = (input: unknown): HeroConfig => heroSchema.parse(input);
export const fallbackHeroSlides: Array<{ image: string; alt: string }> = [];
