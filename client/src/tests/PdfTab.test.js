// ─────────────────────────────────────────────────────────────
// src/tests/PdfTab.test.js
//
// lib/pdfTab.js is how every note opens its PDF. Two things matter:
// the tab is asked for before the PDF exists (a phone blocks one opened
// afterwards), and a blocked tab ends in a saved file, not a dead end.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import { reservePdfTab, showPdf, releasePdfTab } from '../lib/pdfTab';

const fakePdf = () => ({ output: vi.fn(() => 'blob:note'), save: vi.fn() });

afterEach(() => vi.restoreAllMocks());

describe('pdfTab', () => {
  it('opens an empty tab straight away and points it at the PDF later', () => {
    const tab = { closed: false, location: {}, document: {} };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab);

    const reserved = reservePdfTab('Preparing');
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(reserved.document.title).toBe('Preparing');

    const pdf = fakePdf();
    expect(showPdf(pdf, reserved, 'delivery-note-87')).toBe('opened');
    expect(tab.location.href).toBe('blob:note');
    expect(pdf.save).not.toHaveBeenCalled();
  });

  it('saves the file when the browser gives no tab', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const pdf = fakePdf();
    expect(showPdf(pdf, reservePdfTab(), 'delivery-note-87')).toBe('saved');
    expect(pdf.save).toHaveBeenCalledWith('delivery-note-87.pdf');
  });

  it('saves the file when the tab was closed while the PDF was being made', () => {
    const pdf = fakePdf();
    expect(showPdf(pdf, { closed: true, location: {} }, 'x')).toBe('saved');
    expect(pdf.save).toHaveBeenCalledWith('x.pdf');
  });

  it('closes the reserved tab when the PDF could not be made', () => {
    const tab = { close: vi.fn() };
    releasePdfTab(tab);
    expect(tab.close).toHaveBeenCalled();
    expect(() => releasePdfTab(null)).not.toThrow();
  });
});
