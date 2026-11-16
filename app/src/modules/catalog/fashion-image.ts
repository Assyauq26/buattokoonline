export const fashionWidths = [
  160, 240, 320, 480, 768, 1080, 1440, 1920,
] as const;

export function fashionImage(src: string, large: boolean) {
  const path = src.split("?")[0];
  if (
    !/^\/api\/v1\/(?:product-images|(?:admin\/)?store-branding)\/[\w-]+$/.test(
      path,
    )
  )
    return { src };
  const widths = large ? fashionWidths.slice(3) : fashionWidths.slice(0, 4);
  return {
    src: path + "?w=" + (large ? 768 : 240),
    srcSet: widths.map((w) => path + "?w=" + w + " " + w + "w").join(", "),
    sizes: large
      ? "100vw"
      : "(max-width: 767px) min(34vw, 20vh), min(16vw, 22vh, 240px)",
  };
}
