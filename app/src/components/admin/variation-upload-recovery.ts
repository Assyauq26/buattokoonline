import type { ProductEditorData } from "@/modules/catalog/product-management.service";
/** Never adopt a new version merely because an upload failed: preserve external edits. */
export function uploadRecoveryCandidate(
  before: ProductEditorData,
  current: ProductEditorData,
) {
  if (before.id !== current.id || before.updatedAt === current.updatedAt)
    return;
  const fingerprint = ({
    images: _images,
    optionImages: _options,
    updatedAt: _stamp,
    ...rest
  }: ProductEditorData) => JSON.stringify(rest);
  if (
    fingerprint(before) !== fingerprint(current) ||
    JSON.stringify(before.images) !== JSON.stringify(current.images)
  )
    return;
  if (current.optionImages.length !== before.optionImages.length + 1) return;
  if (
    before.optionImages.some(
      (old) =>
        !current.optionImages.some(
          (image) => JSON.stringify(image) === JSON.stringify(old),
        ),
    )
  )
    return;
  const added = current.optionImages.filter(
    (image) => !before.optionImages.some((old) => old.id === image.id),
  );
  const image = added[0];
  if (
    added.length !== 1 ||
    !image.url.startsWith(`/api/v1/product-images/${image.id}?object=`)
  )
    return;
  return image;
}
export async function uploadBytesMatch(file: File, imageUrl: string) {
  if (!imageUrl.startsWith("/api/v1/product-images/")) return false;
  const response = await fetch(imageUrl, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) return false;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== file.size || bytes.byteLength > 4 * 1024 * 1024)
    return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes),
    crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
  ]);
  return new Uint8Array(a).every(
    (byte, index) => byte === new Uint8Array(b)[index],
  );
}
