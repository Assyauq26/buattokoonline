/** The catalog renders each real product at most once, including at the seam. */
export function fashionWindow(total: number, position: number) {
  if (!Number.isSafeInteger(total) || total < 1) return [];
  const index = Number.isSafeInteger(position)
    ? Math.max(0, Math.min(total - 1, position))
    : 0;
  const count = Math.min(total, 5);
  const left = total === 2 ? index : Math.floor((count - 1) / 2);
  return Array.from({ length: count }, (_, n) => {
    const offset = n - left;
    return { offset, pos: (index + offset + total) % total };
  });
}
