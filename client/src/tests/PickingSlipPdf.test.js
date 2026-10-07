// ─────────────────────────────────────────────────────────────
// client/src/tests/PickingSlipPdf.test.js
//
// The printed picking slip: what is on the sheet, and how many sheets.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  buildPickingSlipPdf, pickupDayOf, weekNumberOf, quantityText,
} from '../features/pickingSlips/pickingSlipPdf';

const item = (name, qty, unit = 'kg') => ({ product_name: name, required_quantity: qty, unit });

const SLIP = {
  id: 559, ecd_name: 'Green Pastures', cohort: 'tuesday',
  dispatch_date_iso: '2026-10-06', public_token: '11111111-2222-3333-4444-55555520c6a1',
  items: [item('Butternut', '3', 'crate'), item('Samp', '7.5'), item('Maize meal', '16')],
};

// Every string drawn on the document, in order.
const textOf = (pdf) => {
  const out = [];
  for (const page of pdf.internal.pages.slice(1)) {
    for (const line of page) {
      for (const m of String(line).matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1].replace(/\\([()\\])/g, '$1'));
    }
  }
  return out;
};

describe('picking slip — the facts on the sheet', () => {
  it('names the pickup day from the dispatch date', () => {
    expect(pickupDayOf(SLIP)).toBe('Tuesday');
    expect(pickupDayOf({ dispatch_date_iso: '2026-10-08' })).toBe('Thursday');
    expect(pickupDayOf({ cohort: 'thursday' })).toBe('Thursday');
  });

  it('gives the ISO week number', () => {
    expect(weekNumberOf(SLIP)).toBe(41);
    expect(weekNumberOf({ dispatch_date_iso: '2026-01-01' })).toBe(1);
    expect(weekNumberOf({ dispatch_date_iso: '2027-01-01' })).toBe(53);
    expect(weekNumberOf({})).toBeNull();
  });

  it('prints a quantity to two decimals with its unit', () => {
    expect(quantityText(item('Samp', '7.5'))).toBe('7.50 kg');
    expect(quantityText(item('Butternut', 3, 'crate'))).toBe('3.00 crate');
    expect(quantityText({ required_quantity: '2', unit: null })).toBe('2.00');
  });
});

describe('picking slip — the document', () => {
  it('lays out the paper slip: name, facts, columns, items and the sign-off', () => {
    const { pdf, slipCount, pageCount } = buildPickingSlipPdf([SLIP], { origin: 'https://example.org' });
    const text = textOf(pdf);

    expect(slipCount).toBe(1);
    expect(pageCount).toBe(1);
    expect(text).toContain('Green Pastures');
    expect(text).toContain('Pickup Day: Tuesday');
    expect(text).toContain('Warehouse: LoL Cape Town');
    expect(text).toContain('Week Number: Week 41');
    for (const heading of ['QTY', 'Item', 'QTY Filled', 'Check', 'Comment']) expect(text).toContain(heading);
    expect(text).toContain('7.50 kg');
    expect(text).toContain('Samp');
    for (const line of ['Driver Name:', 'Signature:', 'Date:', 'Invoice #', 'Order checked by:']) expect(text).toContain(line);
  });

  it('carries the pallet code a volunteer types when they cannot scan', () => {
    const { pdf } = buildPickingSlipPdf([SLIP], { origin: 'https://example.org' });
    expect(textOf(pdf)).toContain('20c6a1');
  });

  it('still prints a slip that has no code yet, without one', () => {
    const { pdf, pageCount } = buildPickingSlipPdf([{ ...SLIP, public_token: null }], { origin: 'https://example.org' });
    expect(pageCount).toBe(1);
    expect(textOf(pdf)).not.toContain('Scan to open this pallet');
  });

  it('gives every slip its own page', () => {
    const { pdf, pageCount } = buildPickingSlipPdf(
      [SLIP, { ...SLIP, id: 560, ecd_name: 'Test A' }], { origin: 'https://example.org' });
    expect(pageCount).toBe(2);
    expect(pdf.getNumberOfPages()).toBe(2);
  });

  it('runs a long slip onto a second page instead of dropping lines', () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`Product ${i + 1}`, i + 1));
    const { pdf, pageCount } = buildPickingSlipPdf([{ ...SLIP, items: many }], { origin: 'https://example.org' });
    const text = textOf(pdf);

    expect(pageCount).toBe(2);
    expect(text).toContain('Product 1');
    expect(text).toContain('Product 40');
    expect(text).toContain('Picking slip (continued)');
    // Signed once, at the end.
    expect(text.filter((t) => t === 'Driver Name:')).toHaveLength(1);
  });
});
