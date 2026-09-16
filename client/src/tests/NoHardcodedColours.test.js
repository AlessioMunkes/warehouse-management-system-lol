// ─────────────────────────────────────────────────────────────
// src/tests/NoHardcodedColours.test.js
//
// The codemod in script 45 is a one-off; this is what stops the app
// drifting back. A new `bg-[#faf8f5]` looks right in light mode and is
// invisible to every other test in the suite — it only shows up as a
// white card on a dark page, on someone else's screen, later.
//
// The allowed list is not a loophole, it is the carve-out the script
// documents: pages that are printed, and one toolbar that is dark in
// both themes.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';

// Vite hands over every source file as a string. node:fs would need
// process.cwd(), which is not a browser global and fails lint, and
// import.meta.url is not a file: URL once Vite has served the module —
// both of which the first attempt at this test tripped over.
const SOURCES = import.meta.glob('../**/*.{js,jsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Printed on paper, or rasterised by html2canvas-pro, or already dark.
const ALLOWED = [
  'features/receipts/components/PdfShell.jsx',
  'features/procurement/components/DeliveryNotePDF.jsx',
  'features/dispatch/components/DispatchNotePDF.jsx',
  'features/decanting/components/DecantingSheetPDF.jsx',
];

const COLOUR = /(?:bg|text|border|ring|fill|divide|placeholder)-\[#[0-9a-fA-F]{3,8}\]/g;

describe('no hardcoded colours outside the printed pages', () => {
  it('every screen goes through a theme token', () => {
    const offenders = [];
    for (const [path, source] of Object.entries(SOURCES)) {
      const rel = path.replace(/^\.\.\//, '');
      // tests/ is skipped, and this file is why: it quotes a colour
      // class as an example of the thing it forbids, and caught itself
      // on the first run. A fixture naming a colour is not a screen
      // rendering one.
      if (rel.startsWith('tests/')) continue;
      if (ALLOWED.some((a) => rel.endsWith(a))) continue;
      const found = source.match(COLOUR);
      if (found) offenders.push(`${rel}: ${[...new Set(found)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('is actually reading the source tree, not an empty glob', () => {
    // Without this, a glob that silently matched nothing would make the
    // test above pass forever while checking nothing at all.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
  });
});
