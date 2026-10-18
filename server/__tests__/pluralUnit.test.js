// ─────────────────────────────────────────────────────────────
// server/__tests__/pluralUnit.test.js
//
// A unit as it reads after a number (features/units/pluralUnit.js).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { pluralUnit } from '../src/features/units/pluralUnit.js';

describe('pluralUnit', () => {
  it('pluralises the counted containers unless there is exactly one', () => {
    expect(pluralUnit('crate', 15)).toBe('crates');
    expect(pluralUnit('crate', 1)).toBe('crate');
    expect(pluralUnit('crate', 0.5)).toBe('crates');
    expect(pluralUnit('crate', 0)).toBe('crates');
    expect(pluralUnit('box', 2)).toBe('boxes');
    expect(pluralUnit('bag', 2)).toBe('bags');
    expect(pluralUnit('punnet', 3)).toBe('punnets');
  });

  it('never changes a weight, a volume or each', () => {
    for (const unit of ['kg', 'g', 'l', 'ml', 'each']) {
      expect(pluralUnit(unit, 1)).toBe(unit);
      expect(pluralUnit(unit, 12)).toBe(unit);
    }
  });

  it('puts a plural back to one for one, and leaves an unknown unit alone', () => {
    expect(pluralUnit('crates', 1)).toBe('crate');
    expect(pluralUnit('cans', 4)).toBe('cans');
    expect(pluralUnit('', 4)).toBe('');
    expect(pluralUnit(null, 4)).toBe('');
  });
});
