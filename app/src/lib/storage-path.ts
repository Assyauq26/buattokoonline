export type StorageBucket = "product-images" | "payment-proofs" | "store-branding";
export interface StorageObjectLocation {
  bucket: StorageBucket;
  key: string;
  extension: "jpg" | "png" | "webp" | "pdf";
}

/**
 * Reject arbitrary object keys, parent directory segments, encoded paths and
 * cross-bucket confusion before calling the privileged storage API.
 */
export function resolveStorageObject(path: string, app: string): StorageObjectLocation {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(app)) throw new Error("Invalid storage app name");
  const match = /^([a-zA-Z0-9_-]{1,80})\/(product-images|payment-proofs|store-branding)\/([a-zA-Z0-9_-]{1,128})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|pdf)$/.exec(path);
  if (!match || match[1] !== app) throw new Error("Invalid object path");
  const bucket = match[2] as StorageBucket;
  const extension = match[5] as StorageObjectLocation["extension"];
  if (bucket !== "payment-proofs" && extension === "pdf") throw new Error("Invalid product image type");
  return { bucket, key: path, extension };
}
