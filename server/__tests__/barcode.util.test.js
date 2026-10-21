// ─────────────────────────────────────────────────────────────
// server/__tests__/barcode.util.test.js
//
// utils/barcode.js: one stored form per printed code, and a misread
// refused rather than saved as a new code.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { normaliseBarcode, gs1CheckDigitOk, expandUpcE } from '../src/utils/barcode.js';

describe('normaliseBarcode', () => {
  it('keeps a valid EAN-13 as it is', () => {
    expect(normaliseBarcode('4006381333931')).toEqual({ code: '4006381333931', format: 'ean13' });
  });

  it('refuses an EAN-13 whose check digit is wrong', () => {
    expect(normaliseBarcode('4006381333932')).toBeNull();
  });

  it('stores a 12-digit UPC-A as the EAN-13 it is', () => {
    expect(normaliseBarcode('036000291452')).toEqual({ code: '0036000291452', format: 'ean13' });
  });

  it('stores a GTIN-14 with indicator 0 as its EAN-13', () => {
    expect(normaliseBarcode('00036000291452')).toEqual({ code: '0036000291452', format: 'ean13' });
  });

  it('keeps a case code (GTIN-14, indicator 1 to 8) as its own code', () => {
    expect(normaliseBarcode('10036000291459')).toEqual({ code: '10036000291459', format: 'gtin14' });
  });

  it('keeps a valid EAN-8', () => {
    expect(normaliseBarcode('96385074')).toEqual({ code: '96385074', format: 'ean8' });
  });

  it('expands a UPC-E to the same EAN-13 as its UPC-A', () => {
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(normaliseBarcode('04252614')).toEqual(normaliseBarcode('042100005264'));
  });

  it('ignores spaces and hyphens typed between the digits', () => {
    expect(normaliseBarcode(' 4006381 333931 ')).toEqual(normaliseBarcode('4006381333931'));
    expect(normaliseBarcode('0425-2614')).toEqual(normaliseBarcode('04252614'));
  });

  it("reads a supplier's own code as upper-case text", () => {
    expect(normaliseBarcode('lol-rice-1kg')).toEqual({ code: 'LOLRICE1KG', format: 'text' });
  });

  it('refuses what cannot be a barcode', () => {
    expect(normaliseBarcode('')).toBeNull();
    expect(normaliseBarcode('12')).toBeNull();
    expect(normaliseBarcode('x'.repeat(65))).toBeNull();
    expect(normaliseBarcode('riceé')).toBeNull();
    expect(normaliseBarcode(null)).toBeNull();
    expect(normaliseBarcode({})).toBeNull();
  });
});

describe('gs1CheckDigitOk', () => {
  it('checks the GS1 weights from the right', () => {
    expect(gs1CheckDigitOk('96385074')).toBe(true);
    expect(gs1CheckDigitOk('96385075')).toBe(false);
    expect(gs1CheckDigitOk('abc')).toBe(false);
  });
});
