// ─────────────────────────────────────────────────────────────
// src/tests/LoadingScreen.test.jsx
//
// The loading mark. It sits in the part that is loading: drawn inside
// every loading placeholder by the stylesheet, and as a component only
// where a whole page is loading. It takes the window in one case only,
// the session check, when there is nothing else to show.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LoadingScreen from '../components/ui/loading-screen';
import { Skeleton } from '../components/ui/skeleton';

// This test runs in node, where `process` exists; the lint config only knows
// the browser's globals, and CI lints the tests.
/* global process */
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');

describe('a whole page loading', () => {
  it('fills the page area, not the window', () => {
    render(<LoadingScreen />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Loading');
    expect(el.className).not.toContain('fixed');
    expect(el.className).toContain('min-h-[60vh]');
  });

  it('takes the window only when asked, with its own words', () => {
    render(<LoadingScreen page label="Checking your session" />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Checking your session');
    expect(el.className).toContain('fixed inset-0');
  });

  it('can be held back so a quick load shows nothing', () => {
    render(<LoadingScreen delayed />);
    expect(screen.getByRole('status').className).toContain('loading-screen-delayed');
    expect(css).toMatch(/\.loading-screen-delayed\s*\{[^}]*300ms/);
  });
});

describe('a part of a screen loading', () => {
  it('is still the placeholder every screen already uses', () => {
    const { container } = render(<Skeleton className="h-40 w-full" />);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('has the mark drawn inside all three kinds of placeholder', () => {
    for (const selector of ['[data-slot="skeleton"]::before', '.stf-skeleton::before', '.gst-skeleton::before',
      '[data-slot="skeleton"]::after', '.stf-skeleton::after', '.gst-skeleton::after']) {
      expect(css).toContain(selector);
    }
    expect(css).toContain("url('../assets/Batches_Logo.jpeg')");
    expect(css).toMatch(/container-type:\s*size/);
  });

  it('leaves a placeholder too small to hold it as a plain bar', () => {
    // Hidden unless the placeholder is at least a row tall and wide.
    expect(css).toMatch(/content: "";\s*display: none;/);
    expect(css).toMatch(/@container \(min-height: 3rem\) and \(min-width: 8rem\)/);
  });

  it('gives placeholders side by side one mark between them', () => {
    const group = ':has(> :is([data-slot="skeleton"], .stf-skeleton, .gst-skeleton) + :is([data-slot="skeleton"], .stf-skeleton, .gst-skeleton))';
    // Each one's own mark is switched off, and the group draws one.
    expect(css).toContain(`${group} > :is([data-slot="skeleton"], .stf-skeleton, .gst-skeleton)::before`);
    expect(css).toContain(`${group}::before {`);
    expect(css).toContain(`${group}::after {`);
  });

  it('does not turn for someone who asked for less motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\[data-slot="skeleton"\]::before[^}]*animation: none/);
  });
});
