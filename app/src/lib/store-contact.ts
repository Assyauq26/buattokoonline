/** Public customer-service contact only. Never derive this from seller profiles. */
export function normalizeWhatsApp(raw: string): string | null {
  let n = raw.trim().replace(/[\s().-]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("08")) n = "62" + n.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(n) || n.startsWith("620") || n.startsWith("6262"))
    return null;
  return n;
}
export function storeChatUrl(
  phone: string,
  product: { name: string; slug: string },
  quantity: number,
  variants: string[] = [],
) {
  const n = normalizeWhatsApp(phone);
  if (!n) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  if (!origin) return null;
  const url = new URL(
    "/product/" + encodeURIComponent(product.slug),
    origin || "https://example.invalid",
  );
  const message = [
    `Halo, saya tertarik dengan produk ${product.name}.`,
    ...(variants.length ? [`Variasi: ${variants.join(" • ")}`] : []),
    `Jumlah: ${quantity}`,
    `Link produk: ${url.href}`,
  ].join("\n");
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}
