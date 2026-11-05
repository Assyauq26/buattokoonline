import { describe, it, expect } from 'vitest';
import { formatAddressLocality } from '../../src/lib/address-format';
describe('structured and legacy delivery address display', () => {
  it('includes village then district with explicit level labels', () => {
    expect(formatAddressLocality({ village: 'Gambir', district: 'Gambir' })).toBe('Desa/Kel. Gambir, Kec. Gambir');
  });
  it('keeps null or missing legacy locality empty without punctuation', () => {
    expect(formatAddressLocality({})).toBe('');
    expect(formatAddressLocality({ village: null, district: null })).toBe('');
  });
  it('handles partial snapshots and blank values without invented location names', () => {
    expect(formatAddressLocality({ village: ' Gambir ', district: '' })).toBe('Desa/Kel. Gambir');
    expect(formatAddressLocality({ village: ' ', district: ' Gambir ' })).toBe('Kec. Gambir');
  });
});
