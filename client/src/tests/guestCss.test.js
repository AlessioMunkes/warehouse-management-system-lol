// ──────────────────────────────────────────────────────────
// client/src/tests/guestCss.test.js
//
// Facts about guest.css itself, asserted against the source text.
//
// Two of the four browser-found defects lived entirely in CSS, where a
// render test cannot see them:
//   - a decorative circle behind every heading (removed)
//   - the 56px touch target, which the clipping fix must not shrink
//
// Runs in node, not jsdom: this reads the stylesheet off disk, and under
// jsdom import.meta.url is not a file: URL so fileURLToPath throws
// "The URL must be of scheme file". Same reason and same note as
// duplicate-imports.test.js.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../styles/guest.css', import.meta.url)), 'utf8');

describe('guest.css', () => {
  it('has no decorative pseudo-element on the hero', () => {
    expect(css).not.toMatch(/\.gst-hero::before\s*\{/);
    // and the blob's distinctive shape is not quietly reintroduced
    expect(css).not.toMatch(/border-radius:\s*58%/);
  });

  // The clipping fix had an obvious wrong answer: shrink the targets or
  // the type until it fits. Both are accessibility requirements.
  it('keeps the 56px touch target', () => {
    expect(css).toMatch(/--gst-tap:\s*56px/);
  });

  it('keeps the guest body type at 17px', () => {
    expect(css).toMatch(/font-size:\s*17px/);
  });

  // The actual fixes: children of flex/grid rows must be allowed to
  // shrink, or they push the page wider than the phone.
  it('lets grid and flex children shrink instead of overflowing', () => {
    expect(css).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/min-width:\s*0/);
  });
});
