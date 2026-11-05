/** Measure real glyph boxes; return the largest fitting scale at normal caps. */
export function fitCardPrices(row) {
  const texts = [...row.querySelectorAll('.product-card-price,.product-card-original')];
  const available = row.getBoundingClientRect().width;
  if (!available || !texts.length) return;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const measure = scale => {
    row.style.setProperty('--product-price-scale', String(scale));
    return texts.reduce((sum, text) => sum + text.getBoundingClientRect().width, 0) + gap * (texts.length - 1);
  };
  if (measure(1) <= available) return;
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (measure(mid) <= available) low = mid;
    else high = mid;
  }
  measure(low);
}
