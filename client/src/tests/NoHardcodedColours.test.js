// ─────────────────────────────────────────────────────────────
// src/tests/NoHardcodedColours.test.js
//
// What stops the app drifting back out of the theme. A new hardcoded
// colour looks right in light mode and is invisible to every other test
// in the suite — it only shows up as a white card on a dark page, on
// someone else's screen, later.
//
// TWO PATTERNS, because script 45 only checked the first one and script
// 46 is what that cost:
//
//   1. utility classes   bg-[#2b3336]
//   2. string literals    stroke="#e9e3dd", { color: '#676767' },
//                         const INK = '#2b3336'
//
// The second is where every hand-rolled chart in this codebase keeps
// its colours, so 45's codemod and 45's own guard both walked straight
// past them and the charts stayed in light-mode paint.
//
// The allowed list is not a loophole, it is the carve-out the scripts
// document: pages that are printed, the public landing page, the
// signature pad (its ink ends up in a PDF), and one dead file.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';

// Vite hands over every source file as a string. node:fs would need
// process.cwd(), which is not a browser global and fails lint, and
// import.meta.url is not a file: URL once Vite has served the module.
const SOURCES = import.meta.glob('../**/*.{js,jsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const ALLOWED = [
  // Printed on paper, or rasterised by html2canvas-pro, which cannot
  // read oklch() — the reason these hold literal hex at all.
  'features/receipts/components/PdfShell.jsx',
  'features/procurement/components/DeliveryNotePDF.jsx',
  'features/dispatch/components/DispatchNotePDF.jsx',
  'features/decanting/components/DecantingSheetPDF.jsx',
  'features/packing/palletLabelPdf.js',
  'features/staff/hooks/usePdfDocument.js',
  // A signature drawn in near-white is an invisible signature.
  'features/procurement/components/ProofOfDeliveryForm.jsx',
  'features/procurement/components/SignaturePad.jsx',
  // The public page: its visitors are not logged in and have no toggle.
  'pages/LandingPage.jsx',
  // Dead — its import in App.jsx is commented out.
  'pages/SelectNOCjob.jsx',
];

const UTILITY = /(?:bg|text|border|ring|fill|stroke|divide|placeholder)-\[#[0-9a-fA-F]{3,8}\]/g;
// 3, 6 or 8 digits — the hex lengths this codebase actually writes.
// {3,8} also matched "#0011", a delivery-note record number quoted in a
// comment in ReceiptsPage.jsx, which is not a colour. Four-digit RGBA
// is the gap that leaves, and nothing here uses it.
const LITERAL = /['"]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})['"]/g;

const scan = (pattern) => {
  const offenders = [];
  for (const [path, source] of Object.entries(SOURCES)) {
    const rel = path.replace(/^\.\.\//, '').replace(/^\.\//, '');
    // Fixtures naming a colour are not screens rendering one, and this
    // file quotes both patterns as examples of what it forbids. Matched
    // on the filename as well as the folder: the glob is relative to
    // this directory, so a sibling test comes back as "./Theme.test.jsx"
    // and a tests/ prefix check alone misses it.
    if (rel.startsWith('tests/') || /\.test\.jsx?$/.test(rel)) continue;
    if (ALLOWED.some((a) => rel.endsWith(a))) continue;
    const found = source.match(pattern);
    if (found) offenders.push(`${rel}: ${[...new Set(found)].join(', ')}`);
  }
  return offenders;
};

describe('every colour on a screen goes through a theme token', () => {
  it('no hardcoded utility classes', () => {
    expect(scan(UTILITY)).toEqual([]);
  });

  it('no hardcoded hex in SVG attributes, inline styles or constants', () => {
    expect(scan(LITERAL)).toEqual([]);
  });

  it('is actually reading the source tree, not an empty glob', () => {
    // Without this, a glob that silently matched nothing would make
    // both tests above pass forever while checking nothing at all.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
  });
});
