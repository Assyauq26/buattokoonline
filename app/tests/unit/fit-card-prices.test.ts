// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fitCardPrices } from '../../src/components/storefront/fit-card-prices.mjs';
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
function layout(available: number, widths: number[]) {
  const row=document.createElement('div'); row.style.columnGap='2px';
  document.body.append(row);
  vi.spyOn(row,'getBoundingClientRect').mockImplementation(()=>({width:available} as DOMRect));
  widths.forEach((width,i)=>{
    const text=document.createElement('span');text.className=i?'product-card-original':'product-card-price';row.append(text);
    vi.spyOn(text,'getBoundingClientRect').mockImplementation(()=>({width:width*Number(row.style.getPropertyValue('--product-price-scale')||1)} as DOMRect));
  });
  return row;
}
it('keeps normal type when its actual glyphs fit',()=>{
  const row=layout(100,[30,20]);fitCardPrices(row);
  expect(row.style.getPropertyValue('--product-price-scale')).toBe('1');
});
it('finds the largest fitting boundary using rendered widths and the real gap',()=>{
  const row=layout(60,[80,20]);fitCardPrices(row);
  const scale=Number(row.style.getPropertyValue('--product-price-scale'));
  expect(scale).toBeLessThanOrEqual(.58);expect(scale).toBeGreaterThan(.579);
});
it('different glyph widths with the same text length produce different fitting scales',()=>{
  const wide=layout(60,[100,100]),narrow=layout(60,[10,10]);
  fitCardPrices(wide);fitCardPrices(narrow);
  expect(Number(wide.style.getPropertyValue('--product-price-scale'))).toBeLessThan(.3);
  expect(narrow.style.getPropertyValue('--product-price-scale')).toBe('1');
});
it('can grow again when space becomes available',()=>{
  const row=layout(60,[80,20]);fitCardPrices(row);
  vi.spyOn(row,'getBoundingClientRect').mockImplementation(()=>({width:200} as DOMRect));
  fitCardPrices(row);expect(row.style.getPropertyValue('--product-price-scale')).toBe('1');
});
