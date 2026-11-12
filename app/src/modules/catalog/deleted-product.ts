/** This prefix is rejected by the product slug validator. Prisma uses SQL
 * LIKE for startsWith, so underscore characters must be escaped for Postgres. */
export const DELETED_PRODUCT_PREFIX = "_deleted_";
export const liveProductSlug = { not: { startsWith: "\\_deleted\\_" } } as const;
export function isDeletedProduct(product: { slug: string }) {
  return product.slug.startsWith(DELETED_PRODUCT_PREFIX);
}
