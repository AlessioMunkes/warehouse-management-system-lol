// ─────────────────────────────────────────────────────────────
// src/tests/StockWording.test.js
//
// How the outlook and planner say units, cover time and weekly use
// (lib/stockWording.js). Each figure is worked by hand.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { coverText, fmtQtyUnit, pluralUnit, weeklyUseText } from '../lib/stockWording';

describe('pluralUnit and fmtQtyUnit', () => {
  it('is singular for exactly one, plural for anything else', () => {
    expect(fmtQtyUnit(1, 'crate')).toBe('1 crate');
    expect(fmtQtyUnit(15, 'crate')).toBe('15 crates');
    expect(fmtQtyUnit(0.5, 'crate')).toBe('0.5 crates');
    expect(fmtQtyUnit(0, 'crate')).toBe('0 crates');
    expect(fmtQtyUnit('2.000', 'box')).toBe('2 boxes');
    expect(fmtQtyUnit(3, 'punnet')).toBe('3 punnets');
    expect(fmtQtyUnit(1, 'bag')).toBe('1 bag');
  });

  it('leaves weights, volumes and each alone', () => {
    expect(fmtQtyUnit(1, 'kg')).toBe('1 kg');
    expect(fmtQtyUnit(30, 'kg')).toBe('30 kg');
    expect(fmtQtyUnit(2, 'l')).toBe('2 l');
    expect(fmtQtyUnit(5, 'each')).toBe('5 each');
    expect(pluralUnit('cans', 1)).toBe('cans');
  });

  it('says a dash for no figure, and no unit for none', () => {
    expect(fmtQtyUnit(null, 'crate')).toBe('-');
    expect(fmtQtyUnit(4, '')).toBe('4');
  });
});

describe('coverText', () => {
  it('is days only under two weeks', () => {
    expect(coverText(1)).toBe('1 day');
    expect(coverText(10)).toBe('10 days');
    expect(coverText(13)).toBe('13 days');
  });

  it('is weeks and leftover days from two to four weeks, weeks alone when none are left', () => {
    expect(coverText(14)).toBe('2 weeks');
    expect(coverText(15)).toBe('2 weeks, 1 day');
    expect(coverText(23)).toBe('3 weeks, 2 days');   // 23 = 3 x 7 + 2
    expect(coverText(21)).toBe('3 weeks');
    expect(coverText(27)).toBe('3 weeks, 6 days');
    expect(coverText(28)).toBe('4 weeks');
  });

  it('is whole weeks above four weeks, rounded down and never a decimal', () => {
    expect(coverText(29)).toBe('4 weeks');     // 4.14 weeks
    expect(coverText(34)).toBe('4 weeks');     // 4.86 weeks: not 5
    expect(coverText(35)).toBe('5 weeks');
    expect(coverText(50)).toBe('7 weeks');     // 7.14 weeks
    expect(coverText(174)).toBe('24 weeks');   // 24.86 weeks: not 25
  });

  it('rounds a fractional day down too', () => {
    expect(coverText(13.9)).toBe('13 days');
    expect(coverText(14.9)).toBe('2 weeks');
  });

  it('says nothing for none left or no figure, so the caller can use its own words', () => {
    expect(coverText(0)).toBeNull();
    expect(coverText(-3)).toBeNull();
    expect(coverText(null)).toBeNull();
    expect(coverText(undefined)).toBeNull();
    expect(coverText(0.8)).toBeNull();
  });
});

describe('weeklyUseText', () => {
  it('says a week for one or more', () => {
    expect(weeklyUseText(50, 'kg')).toBe('50 kg a week');
    expect(weeklyUseText(1, 'crate')).toBe('1 crate a week');
    expect(weeklyUseText(5, 'crate')).toBe('5 crates a week');
    expect(weeklyUseText(2.5, 'bag')).toBe('2.5 bags a week');
  });

  it('says a month for under one a week, nearest whole', () => {
    // 52 weeks over 12 months is 4.33 weeks a month.
    expect(weeklyUseText(0.63, 'crate')).toBe('about 3 crates a month');    // 2.73
    expect(weeklyUseText(0.5, 'kg')).toBe('about 2 kg a month');            // 2.17
    expect(weeklyUseText(0.25, 'box')).toBe('about 1 box a month');         // 1.08
    expect(weeklyUseText(0.9, 'bag')).toBe('about 4 bags a month');         // 3.9
    expect(weeklyUseText(0.1, 'each')).toBe('less than 1 each a month');    // 0.43
    expect(weeklyUseText(0.1, 'crate')).toBe('less than 1 crate a month');
  });

  it('says nothing when nothing is used', () => {
    expect(weeklyUseText(0, 'kg')).toBe('');
    expect(weeklyUseText(null, 'kg')).toBe('');
  });
});
