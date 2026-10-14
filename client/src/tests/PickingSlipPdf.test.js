// ─────────────────────────────────────────────────────────────
// client/src/tests/PickingSlipPdf.test.js
//
// The printed picking slip: what is on the sheet, and how many sheets.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  buildPickingSlipPdf, pickupDayOf, weekNumberOf, quantityText, QR_SIZE as SLIP_QR_MM,
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
    expect(textOf(pdf)).not.toContain('SCAN TO OPEN');
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

// ── What the printed QR says it does ──────────────────────────
// The partner VMS prints a different QR, for volunteer attendance, that the
// same people scan. A volunteer has to be able to see, from across a pallet,
// which one this is. The wording was 7.5 pt grey; it is now large, bold and
// black, and says nothing that sounds like checking in.
describe('picking slip: the words under the QR', () => {
  const MM = 72 / 25.4;

  // Each drawn string with the size, colour and start position it was
  // drawn with, read from the PDF's own content stream.
  const drawn = (pdf) => {
    const out = [];
    for (const page of pdf.internal.pages.slice(1)) {
      for (const block of page) {
        const m = /\/F(\d+) ([\d.]+) Tf[\s\S]*?([\d.]+) g[\s\S]*?([\d.-]+) ([\d.-]+) Td\s*\(((?:\\.|[^\\)])*)\) Tj/.exec(String(block));
        if (m) out.push({ font: m[1], size: Number(m[2]), grey: Number(m[3]), x: Number(m[4]), y: Number(m[5]), text: m[6] });
      }
    }
    return out;
  };

  const build = (slip = SLIP) => drawn(buildPickingSlipPdf([slip], { origin: 'https://example.org' }).pdf);

  it('says SCAN TO OPEN THIS PALLET, in capitals, on two lines', () => {
    const text = build().map((d) => d.text);
    expect(text).toContain('SCAN TO OPEN');
    expect(text).toContain('THIS PALLET');
    expect(text).not.toContain('Scan to open this pallet');
  });

  it('draws it clearly larger than before (was 7.5 pt) and in solid black, not grey', () => {
    const words = build().filter((d) => d.text === 'SCAN TO OPEN' || d.text === 'THIS PALLET');
    expect(words).toHaveLength(2);
    for (const w of words) {
      expect(w.size).toBeGreaterThanOrEqual(10);
      expect(w.grey).toBe(0);
    }
  });

  it('is bold, like the slip\u2019s other headings', () => {
    const all = build();
    const words = all.find((d) => d.text === 'SCAN TO OPEN');
    const boldFont = all.find((d) => d.text === 'Pickup Day: Tuesday').font;   // drawn in helvetica bold
    expect(words.font).toBe(boldFont);
  });

  it('sits under the QR, above the typed code, which sits above the facts line', () => {
    const all = build();
    const y = (text) => all.find((d) => d.text === text).y;
    // PDF y runs up the page: higher on the page is a bigger number.
    expect(y('SCAN TO OPEN')).toBeGreaterThan(y('THIS PALLET'));
    expect(y('THIS PALLET')).toBeGreaterThan(y('20c6a1'));
    expect(y('20c6a1')).toBeGreaterThan(y('Pickup Day: Tuesday'));
  });

  it('stays on the page, on the right where the QR is', () => {
    const all = build();
    for (const text of ['SCAN TO OPEN', 'THIS PALLET', '20c6a1']) {
      const d = all.find((x) => x.text === text);
      expect(d.x).toBeGreaterThan(150 * MM);               // under the QR, right of the name
      expect(d.x).toBeLessThan(205 * MM);
    }
  });

  it('never uses wording that could be read as checking in or signing on', () => {
    const everything = build().map((d) => d.text).join(' ').toLowerCase();
    for (const word of ['check in', 'check-in', 'sign in', 'register', 'arrival', 'attendance']) {
      expect(everything).not.toContain(word);
    }
  });

  it('keeps the QR at least its old size and the slip to the same number of rows', () => {
    expect(SLIP_QR_MM).toBeGreaterThanOrEqual(30);
    const many = Array.from({ length: 21 }, (_, i) => item(`Product ${i + 1}`, i + 1));
    const { pageCount } = buildPickingSlipPdf([{ ...SLIP, items: many }], { origin: 'https://example.org' });
    // 21 lines and the 2 spare rows (23 rows) still fit on one page, as before.
    expect(pageCount).toBe(1);
  });

  it('prints no words at all when there is no code to scan', () => {
    const text = build({ ...SLIP, public_token: null }).map((d) => d.text);
    expect(text).not.toContain('SCAN TO OPEN');
  });
});
