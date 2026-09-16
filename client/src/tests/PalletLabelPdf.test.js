// ──────────────────────────────────────────────────────────
// client/src/tests/PalletLabelPdf.test.js
//
// The printable pallet label (BR-22).
//
// Runs in node, not jsdom: the module is deliberately free of DOM
// dependencies — it draws straight into jsPDF rather than rasterising a
// component — which is what makes it testable at all.
//
// The one thing these tests CANNOT prove is that the printed code
// scans. That was verified separately by rendering the generated PDF
// and decoding it with a QR reader; see the Phase 3 report.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
// Explicit: this file runs in the node environment, but the client's
// eslint config is browser-global, where Buffer is not defined.
import { Buffer } from 'node:buffer';
import {
  buildLabelPdf, shortCodeOf, slipUrlFor,
} from '../features/packing/palletLabelPdf';

const TOKEN = '0f574c6f-a6c1-4f12-827d-d64424a8ea04';

const slip = (over = {}) => ({
  public_token: TOKEN,
  ecd_name: 'Ikhaya Lethemba Educare',
  beneficiary_name: null,
  dispatch_date_display: '2026-09-16',
  ...over,
});

// The PDF is text-searchable because it is drawn, not rasterised —
// which means the content can be asserted directly.
const textOf = (pdf) => {
  const raw = pdf.output('arraybuffer');
  return Buffer.from(raw).toString('latin1');
};

describe('shortCodeOf', () => {
  // Must agree with the server, which matches on RIGHT(token::text, 6).
  it('is the last six characters, lowercased', () => {
    expect(shortCodeOf(TOKEN)).toBe('a8ea04');
    expect(shortCodeOf('ABCDEF12-0000-0000-0000-00000000AB12')).toBe('00ab12');
  });

  it('does not throw on a missing token', () => {
    expect(shortCodeOf(null)).toBe('');
    expect(shortCodeOf(undefined)).toBe('');
  });
});

describe('slipUrlFor', () => {
  it('builds the BR-22 slip URL the QR resolves to', () => {
    expect(slipUrlFor(TOKEN, 'https://wms.example.org'))
      .toBe(`https://wms.example.org/slip/${TOKEN}`);
  });
});

describe('buildLabelPdf', () => {
  it('makes one page per pallet', () => {
    const { pdf, pageCount } = buildLabelPdf(
      [slip(), slip({ public_token: '11111111-1111-4111-8111-111111111111' })],
      { origin: 'https://x.test' },
    );
    expect(pageCount).toBe(2);
    expect(pdf.internal.getNumberOfPages()).toBe(2);
  });

  it('is A4 portrait', () => {
    const { pdf } = buildLabelPdf([slip()], { origin: 'https://x.test' });
    expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
    expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
  });

  // The wording constraint from the brief: the partner VMS also prints
  // QR codes for attendance check-in, and both end up in the same
  // warehouse on the same day. A volunteer who scans ours believing
  // they have checked in for a shift has not.
  it('says what scanning does, and never says check in', () => {
    const text = textOf(buildLabelPdf([slip()], { origin: 'https://x.test' }).pdf);

    expect(text).toContain('SCAN TO OPEN THIS PALLET');
    for (const forbidden of ['CHECK IN', 'Check in', 'check in', 'SIGN IN', 'Sign in',
                             'REGISTER', 'Register', 'ARRIVAL', 'Arrival', 'attendance']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('prints the beneficiary, the short code and the date', () => {
    const text = textOf(buildLabelPdf([slip()], { origin: 'https://x.test' }).pdf);

    expect(text).toContain('Ikhaya Lethemba Educare');
    expect(text).toContain('a8ea04');
    expect(text).toContain('2026-09-16');
  });

  it('prefers the slip beneficiary name over the ECD name when set', () => {
    const text = textOf(buildLabelPdf(
      [slip({ beneficiary_name: 'Rondebosch Soup Kitchen' })], { origin: 'https://x.test' },
    ).pdf);
    expect(text).toContain('Rondebosch Soup Kitchen');
  });

  // The QR is drawn as filled rectangles, not embedded as an image.
  // That is what keeps the module edges exact at print size.
  it('draws the code as vector rectangles, not a bitmap', () => {
    const text = textOf(buildLabelPdf([slip()], { origin: 'https://x.test' }).pdf);

    const rectFills = (text.match(/re\s*f/g) || []).length;
    expect(rectFills).toBeGreaterThan(300);      // a QR has hundreds of dark modules
    // No embedded image anywhere: the code is geometry, not a picture
    // of a code. (jsPDF always writes an /XObject resource dictionary,
    // empty or not, so its presence proves nothing either way.)
    expect(text).not.toContain('/Subtype /Image');
    expect(text).not.toContain('/Filter /DCTDecode');
  });

  // A slip with no token cannot produce a scannable label, and a blank
  // page in the middle of a print run is worse than one fewer page.
  it('skips a slip with no token rather than printing a broken page', () => {
    const { pageCount, skipped } = buildLabelPdf(
      [slip(), { ecd_name: 'No token', public_token: null }],
      { origin: 'https://x.test' },
    );
    expect(pageCount).toBe(1);
    expect(skipped).toBe(1);
  });

  it('produces no pages for an empty list', () => {
    expect(buildLabelPdf([], { origin: 'https://x.test' }).pageCount).toBe(0);
    expect(buildLabelPdf(undefined, { origin: 'https://x.test' }).pageCount).toBe(0);
  });

  // The label is the one thing a volunteer holds that is not the app,
  // so the URL on it has to be absolute and point at the slip route.
  it('encodes an absolute slip URL', () => {
    const { pdf } = buildLabelPdf([slip()], { origin: 'https://wms.example.org' });
    expect(pdf).toBeTruthy();
    expect(slipUrlFor(TOKEN, 'https://wms.example.org')).toMatch(/^https:\/\/.+\/slip\/[0-9a-f-]{36}$/);
  });
});
