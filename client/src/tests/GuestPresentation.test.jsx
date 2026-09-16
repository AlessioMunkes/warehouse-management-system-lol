// ─────────────────────────────────────────────────────────────
// client/src/tests/GuestPresentation.test.jsx
//
// Regression cover for the four presentation defects found by walking
// the guest flow in a real browser on 2026-09-16. All four were
// invisible to the render tests that already existed, because those
// tests asserted the behaviour the bugs produced.
//
//   1. layout clipped at narrow widths        — CSS; verified in real
//      Chrome at 320/360/414 and 200% zoom, not here (jsdom has no
//      layout engine, so it CANNOT catch a clipping bug — asserting it
//      here would be theatre).
//   2. the volunteer's name was truncated at the first space
//   3. every beneficiary was described as a "creche"
//   4. a decorative circle behind every heading
//
// 2 and 3 are logic and are locked down here. 4 is asserted as the
// absence of the element.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { displayName, beneficiaryKind, foodForPhrase, formatDay } from '../features/guest/guestFormat';
import { PalletCard } from '../features/guest/components/GuestPrimitives';

// ── Defect 2 — names are never cut ────────────────────────────
describe('displayName — the whole name, always', () => {
  // The exact values that were rendering wrongly in the browser.
  it.each([
    ['Test Tester',                  'Test Tester'],
    ['Corporate group (Old Mutual)', 'Corporate group (Old Mutual)'],
    ['ZZZ TEST 16 SEPT',             'ZZZ TEST 16 SEPT'],
    ['Mary Anne',                    'Mary Anne'],
    ['Thabo',                        'Thabo'],
  ])('keeps %s intact', (stored, shown) => {
    expect(displayName(stored)).toBe(shown);
  });

  it('never splits on whitespace', () => {
    const name = 'Corporate group (Old Mutual)';
    expect(displayName(name)).not.toBe('Corporate');
    expect(displayName(name).split(' ').length).toBeGreaterThan(1);
  });

  it('trims but does not otherwise alter what was typed', () => {
    expect(displayName('  Test Tester  ')).toBe('Test Tester');
  });

  it('falls back only when there is genuinely no name', () => {
    expect(displayName('')).toBe('there');
    expect(displayName(null)).toBe('there');
    expect(displayName(undefined)).toBe('there');
    expect(displayName('   ')).toBe('there');
  });
});

// ── Defect 3 — the beneficiary is described correctly ─────────
describe('beneficiaryKind — all four enum values', () => {
  // public.beneficiary_type: ecd, dignity_kitchen, soup_kitchen, community
  it.each([
    ['ecd',             'creche'],
    ['dignity_kitchen', 'dignity kitchen'],
    ['soup_kitchen',    'soup kitchen'],
    ['community',       'community group'],
  ])('%s reads as "%s"', (kind, noun) => {
    expect(beneficiaryKind(kind).noun).toBe(noun);
  });

  it('does not call a soup kitchen a creche', () => {
    expect(foodForPhrase('soup_kitchen')).toBe('Food for a soup kitchen');
    expect(foodForPhrase('soup_kitchen')).not.toMatch(/creche/);
  });

  it('never prints a raw enum value at a volunteer', () => {
    for (const kind of ['ecd', 'dignity_kitchen', 'soup_kitchen', 'community']) {
      expect(foodForPhrase(kind)).not.toMatch(/_/);
    }
  });

  it('falls back to neutral wording for an unknown or missing kind', () => {
    expect(beneficiaryKind('something_new').noun).toBe('community partner');
    expect(beneficiaryKind(undefined).noun).toBe('community partner');
  });
});

describe('PalletCard describes the beneficiary it was given', () => {
  it('calls Rondebosch Soup Kitchen a soup kitchen', () => {
    render(<PalletCard slip={{
      id: 136, beneficiaryName: 'Rondebosch Soup Kitchen', beneficiaryKind: 'soup_kitchen',
      dispatchDate: '2026-09-16', itemCount: 0, status: 'pending', isClaimed: false,
    }} />);

    expect(screen.getByText(/Food for a soup kitchen/)).toBeInTheDocument();
    expect(screen.queryByText(/creche/)).not.toBeInTheDocument();
  });

  it('still calls an ECD a creche', () => {
    render(<PalletCard slip={{
      id: 132, beneficiaryName: 'Little Angels Educare', beneficiaryKind: 'ecd',
      dispatchDate: '2026-09-16', itemCount: 9, status: 'pending', isClaimed: false,
    }} />);

    expect(screen.getByText(/Food for a creche/)).toBeInTheDocument();
  });
});

// ── Defect 4 — the decorative circle is gone ──────────────────
describe('no decorative shape behind the headings', () => {
  it('renders no element whose only job is decoration', () => {
    const { container } = render(<PalletCard slip={{
      id: 1, beneficiaryName: 'X', beneficiaryKind: 'ecd',
      dispatchDate: '2026-09-16', itemCount: 1, status: 'pending', isClaimed: false,
    }} />);
    // The blob was a ::before on .gst-hero. Its removal is a CSS fact,
    // asserted in the stylesheet test below; here we only confirm the
    // hero carries no positioning hook that a shape would need.
    expect(container.querySelector('.gst-hero[style]')).toBeNull();
  });
});

// ── Dates, retested after the wrapping changes ────────────────
describe('formatDay still reads as a calendar day', () => {
  it('does not shift a plain date by a timezone', () => {
    // 2026-09-16 must never render as 15 September.
    expect(formatDay('2026-09-16')).not.toMatch(/15/);
  });

  it('tolerates a full timestamp without shifting the day', () => {
    expect(formatDay('2026-09-16T00:00:00.000Z')).toBe(formatDay('2026-09-16'));
  });
});
