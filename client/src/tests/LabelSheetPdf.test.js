// ─────────────────────────────────────────────────────────────
// src/tests/LabelSheetPdf.test.js
//
// features/labels/labelSheetPdf.js: the shared sticker sheet. 21 to an
// A4 page, capped at MAX_LABELS in one go.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildLabelSheet, MAX_LABELS, PER_PAGE } from '../features/labels/labelSheetPdf';

describe('the label sheet', () => {
  it('puts 21 stickers on a page', () => {
    const { labelCount, pageCount } = buildLabelSheet({
      title: 'Butternut', useBy: false, labels: [{ code: 'LOL4N1', caption: '1 crate', count: 43 }],
    });
    expect(PER_PAGE).toBe(21);
    expect(labelCount).toBe(43);
    expect(pageCount).toBe(3);
  });

  it('never prints more than the cap in one go', () => {
    const { labelCount } = buildLabelSheet({ title: 'Rice', labels: [{ code: 'LOL12K1000', count: 100000 }] });
    expect(labelCount).toBe(MAX_LABELS);
  });
});
