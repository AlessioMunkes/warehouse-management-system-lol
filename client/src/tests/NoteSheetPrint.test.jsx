// ─────────────────────────────────────────────────────────────
// src/tests/NoteSheetPrint.test.jsx
//
// Every note can be printed from the page it is viewed on. Two things
// have to hold: the note has a Print button, and the note is a direct
// child of <body> under the class the print stylesheet keeps, because
// that stylesheet hides everything else on the page.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('jspdf', () => ({ default: vi.fn() }));
vi.mock('html2canvas-pro', () => ({ default: vi.fn() }));

const { default: NoteSheet } = await import('../features/receipts/NoteSheet');
// Read from disk: Vitest does not process stylesheets, so importing one
// gives an empty string.
const css = (name) => readFileSync(fileURLToPath(new URL(`../styles/${name}`, import.meta.url)), 'utf8');
const receiptsCss = css('receipts.css');
const noteCss = css('deliveryNotePDF.css');

afterEach(() => vi.restoreAllMocks());

const sheet = () => render(
  <div data-testid="app">
    <NoteSheet title="Delivery Note" toolbarTitle="DELIVERY NOTE #87" onClose={() => {}}>
      <p>the lines</p>
    </NoteSheet>
  </div>,
);

describe('printing a note', () => {
  it('has a Print button that prints this page', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    sheet();
    await userEvent.click(screen.getByRole('button', { name: 'PRINT' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('sits directly under body, where the print rules can single it out', () => {
    const { container } = sheet();
    const modal = document.querySelector('.pdfnote-modal');
    expect(modal.parentElement).toBe(document.body);
    expect(container.querySelector('.pdfnote-modal')).toBeNull();
  });

  // receipts.css is loaded on every page. Its print rule hides all of
  // body's children except the note shells it names, so a shell it does
  // not name prints as a blank page.
  it('is one of the shells the print stylesheet keeps', () => {
    expect(receiptsCss).toMatch(/body > \*:not\(\.pdf-modal\):not\(\.pdfnote-modal\)\s*\{\s*display:\s*none/);
  });

  it('prints without the toolbar or the scrolling box', () => {
    const print = noteCss.slice(noteCss.indexOf('@media print'));
    expect(print).toMatch(/\.pdfnote-toolbar\s*\{\s*display:\s*none/);
    expect(print).toMatch(/\.pdfnote-scroll-area\s*\{[^}]*overflow:\s*visible/);
  });
});
