// ─────────────────────────────────────────────────────────────
// server/__tests__/barcode.util.test.js
//
// utils/barcode.js: one stored form per printed code, and a misread
// refused rather than saved as a new code.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseBarcode, gs1CheckDigitOk, expandUpcE, parseGs1, ownBagCode, ownLabelCode } from '../src/utils/barcode.js';

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

describe('GS1 case labels', () => {
  const GS = '\u001d';

  it('reads the bracketed form printed under the bars', () => {
    expect(normaliseBarcode('(01)10036000291459(17)261231(10)AB12')).toEqual({
      code: '10036000291459', format: 'gtin14', gs1: { useBy: '2026-12-31', batch: 'AB12' },
    });
  });

  it('reads what a scanner sends: a ]C1 prefix and separators, no brackets', () => {
    expect(normaliseBarcode(`]C10110036000291459172612001 0LOT7${GS}3103002500`.replace(' ', ''))).toEqual({
      code: '10036000291459', format: 'gtin14', gs1: { useBy: '2026-12-31', batch: 'LOT7' },
    });
  });

  it('takes best before when there is no use by, and day 00 as the end of the month', () => {
    expect(parseGs1('(01)00036000291452(15)270200')).toEqual({ gtin: '00036000291452', useBy: '2027-02-28', batch: null });
  });

  it('stores the GTIN inside by the plain rules', () => {
    expect(normaliseBarcode('(01)00036000291452(10)X').code).toBe('0036000291452');
  });

  it('refuses a label that looks like GS1 but does not read: a misread, not a new code', () => {
    expect(normaliseBarcode('(01)10036000291458(17)261231')).toBeNull();   // check digit
    expect(normaliseBarcode('01100360002914591726123')).toBeNull();         // cut short
  });

  it('leaves plain barcodes alone', () => {
    expect(parseGs1('4006381333931')).toBeNull();
    expect(parseGs1('10036000291459')).toBeNull();
  });
});

describe('ownBagCode', () => {
  it('names the product and the bag size, as plain Code 128 text', () => {
    expect(ownBagCode(12, 2)).toBe('LOL12K2000');
    expect(ownBagCode(12, 0.5)).toBe('LOL12K500');
    expect(normaliseBarcode(ownBagCode(12, 2))).toEqual({ code: 'LOL12K2000', format: 'text' });
  });
});

describe('ownLabelCode', () => {
  it('gives a weighed item the same code as a decanted bag of that size', () => {
    expect(ownLabelCode(12, 2, 'kg')).toBe(ownBagCode(12, 2));
    expect(ownLabelCode(12, 500, 'g')).toBe('LOL12K500');
    expect(ownLabelCode(7, 2, 'l')).toBe('LOL7K2000');
  });

  it('counts a counted item: one crate, a box of six', () => {
    expect(ownLabelCode(4, 1, 'crate')).toBe('LOL4N1');
    expect(ownLabelCode(4, 6, 'each')).toBe('LOL4N6');
    expect(normaliseBarcode(ownLabelCode(4, 1, 'crate'))).toEqual({ code: 'LOL4N1', format: 'text' });
  });

  it('has no code for nothing, or part of a counted item', () => {
    expect(ownLabelCode(4, 0, 'crate')).toBeNull();
    expect(ownLabelCode(4, 1.5, 'crate')).toBeNull();
    expect(ownLabelCode(4, 'x', 'kg')).toBeNull();
  });
});

// The client keeps a copy of these rules (features/scan/productCode.js)
// so a screen answers a misread without a round trip. The rules below
// the header must be the same text, or the two will disagree.
describe('the client twin', () => {
  it('has the same rules, word for word', () => {
    const rules = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
      .replace(/\r\n/g, '\n').split('const MAX_LENGTH = 64;')[1];
    expect(rules('../../client/src/features/scan/productCode.js')).toBe(rules('../src/utils/barcode.js'));
  });
});
