// ─────────────────────────────────────────────────────────────
// src/tests/BagLabelPdf.test.js
//
// features/decanting/bagLabelPdf.js: one sticker per bag, 21 to an A4
// sheet, each carrying a Code 128 barcode of the bag's own code.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildBagLabelPdf, barModules } from '../features/decanting/bagLabelPdf';

describe('bag labels', () => {
  it('makes one label per bag, 21 to a page', () => {
    const { labelCount, pageCount, pdf } = buildBagLabelPdf({
      productName: 'Rice (loose)', decantedOn: '2026-10-22',
      bags: [{ label: '2kg', count: 15, code: 'LOL12K2000' }, { label: '1kg', count: 10, code: 'LOL12K1000' }],
    });
    expect(labelCount).toBe(25);
    expect(pageCount).toBe(2);
    expect(pdf.getNumberOfPages()).toBe(2);
  });

  it('prints nothing for bags that were not made', () => {
    expect(buildBagLabelPdf({ productName: 'Rice', decantedOn: '2026-10-22', bags: [{ label: '5kg', count: 0, code: 'LOL1K5000' }] }).labelCount).toBe(0);
  });

  it('draws Code 128: start pattern B, stop pattern at the end', () => {
    const bars = barModules('LOL12K2000');
    expect(bars.startsWith('11010010000')).toBe(true);    // Start B
    expect(bars.endsWith('1100011101011')).toBe(true);     // Stop
  });
});
