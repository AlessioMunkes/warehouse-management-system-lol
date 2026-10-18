// ─────────────────────────────────────────────────────────────
// client/src/tests/TakeFirst.test.jsx
//
// First expired, first out: a slip item's use_first_date becomes the
// same instruction on the packing screen and the printed slip, and
// says nothing when no date is on record.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { takeFirstDay, takeFirstText } from '../features/packing/takeFirst';
import { buildPickingSlipPdf } from '../features/pickingSlips/pickingSlipPdf';

const textOf = (pdf) => {
  const out = [];
  for (const page of pdf.internal.pages.slice(1)) {
    for (const line of page) {
      for (const m of String(line).matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1].replace(/\\([()\\])/g, '$1'));
    }
  }
  return out;
};

describe('takeFirst', () => {
  it('turns the date into the words a packer reads', () => {
    expect(takeFirstDay({ use_first_date: '2026-10-14' })).toBe('14 Oct');
    expect(takeFirstText({ use_first_date: '2026-10-14' })).toBe('Use the stock dated 14 Oct first');
  });

  it('reads the calendar day even from a full timestamp', () => {
    expect(takeFirstDay({ use_first_date: '2026-10-14T00:00:00.000Z' })).toBe('14 Oct');
  });

  it('says nothing for a product with no date on record', () => {
    expect(takeFirstText({ use_first_date: null })).toBe('');
    expect(takeFirstText({})).toBe('');
    expect(takeFirstText({ use_first_date: 'soon' })).toBe('');
    expect(takeFirstText(undefined)).toBe('');
  });
});

describe('picking slip — use first', () => {
  const slip = (items) => ({
    ecd_name: 'Green Pastures', cohort: 'tuesday', dispatch_date_iso: '2026-10-06',
    public_token: '11111111-2222-3333-4444-55555520c6a1', items,
  });

  it('prints the date beside a product that has one, and nothing beside one that has not', () => {
    const { pdf } = buildPickingSlipPdf([slip([
      { product_name: 'Cabbage', required_quantity: 11, unit: 'crate', use_first_date: '2026-10-14' },
      { product_name: 'Samp', required_quantity: 7.5, unit: 'kg', use_first_date: null },
    ])], { origin: 'https://example.org' });
    const text = textOf(pdf);

    expect(text).toContain('Use dated 14 Oct first');
    expect(text.filter((t) => t.startsWith('Use dated'))).toHaveLength(1);
    expect(text).toContain('Cabbage');
    expect(text).toContain('Samp');
  });

  it('keeps a long product name from running under the date', () => {
    const name = 'Mystery unlabeled crate B with a very long descriptive product name indeed';
    const { pdf } = buildPickingSlipPdf([slip([
      { product_name: name, required_quantity: 1, unit: 'crate', use_first_date: '2026-10-14' },
    ])], { origin: 'https://example.org' });
    const text = textOf(pdf);

    expect(text).toContain('Use dated 14 Oct first');
    const printed = text.find((t) => t.startsWith('Mystery'));
    expect(printed.length).toBeLessThan(name.length);
  });
});
