// ─────────────────────────────────────────────────────────────
// src/tests/productCode.test.js
//
// The client twin of server/src/utils/barcode.js. Same codes as
// server/__tests__/barcode.util.test.js, so the two cannot drift
// without one of the suites saying so.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { normaliseBarcode } from '../features/scan/productCode';

describe('normaliseBarcode (client)', () => {
  it.each([
    ['4006381333931', { code: '4006381333931', format: 'ean13' }],
    ['036000291452', { code: '0036000291452', format: 'ean13' }],
    ['00036000291452', { code: '0036000291452', format: 'ean13' }],
    ['10036000291459', { code: '10036000291459', format: 'gtin14' }],
    ['96385074', { code: '96385074', format: 'ean8' }],
    ['04252614', { code: '0042100005264', format: 'ean13' }],
    [' 4006381 333931 ', { code: '4006381333931', format: 'ean13' }],
    ['lol-rice-1kg', { code: 'LOLRICE1KG', format: 'text' }],
  ])('reads %j', (raw, expected) => {
    expect(normaliseBarcode(raw)).toEqual(expected);
  });

  it.each(['4006381333932', '', '12', 'x'.repeat(65), 'riceé', null])('refuses %j', (raw) => {
    expect(normaliseBarcode(raw)).toBeNull();
  });
});
