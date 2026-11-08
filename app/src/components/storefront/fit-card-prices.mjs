/** Measure real glyph boxes; return the largest fitting scale at normal caps. */
export function fitCardPrices(row, longDiscount = false) {
  const texts = [...row.querySelectorAll('.product-card-price,.product-card-original')];
  const available = row.getBoundingClientRect().width;
  if (!available || !texts.length) return;
  row.removeAttribute('data-stacked-prices');
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  let stacked = false;
  const measure = scale => {
    row.style.setProperty('--product-price-scale', String(scale));
    const widths = texts.map(text => text.getBoundingClientRect().width);
    return stacked ? Math.max(...widths) : widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  };
  if (measure(1) <= available) return;
  if (longDiscount && texts.length === 2 && measure(.8) > available) {
    stacked = true;
    row.setAttribute('data-stacked-prices', '');
    if (measure(1) <= available) return;
  }
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (measure(mid) <= available) low = mid;
    else high = mid;
  }
  measure(low);
}
