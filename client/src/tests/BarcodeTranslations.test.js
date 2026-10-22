// ─────────────────────────────────────────────────────────────
// client/src/tests/BarcodeTranslations.test.js
//
// The product barcode bar's words (barcode.*) and the packing scan
// messages (slip.scan.*), in all three languages, under the same house
// rules as the pallet scan text (ScanTranslations.test.js).
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { MESSAGES } from '../translations/messages';

const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('barcode.') || k.startsWith('slip.scan.'));

describe('barcode scan text', () => {
  it('exists', () => {
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });

  it.each(['af', 'xh'])('is in %s, not left in English', (lang) => {
    for (const key of keys) {
      expect(MESSAGES[lang][key], key).toBeTruthy();
      expect(MESSAGES[lang][key], key).not.toBe(MESSAGES.en[key]);
    }
  });

  it.each(['en', 'af', 'xh'])('has no em dash in %s', (lang) => {
    for (const key of keys) expect(MESSAGES[lang][key], key).not.toMatch(/[—–]/);
  });

  it.each(['af', 'xh'])('keeps every {placeholder} in %s', (lang) => {
    for (const key of keys) {
      const wanted = (MESSAGES.en[key].match(/\{\w+\}/g) ?? []).sort();
      const got = (MESSAGES[lang][key].match(/\{\w+\}/g) ?? []).sort();
      expect(got, key).toEqual(wanted);
    }
  });
});
