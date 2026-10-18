// ─────────────────────────────────────────────────────────────
// server/__tests__/poMoney.test.js
//
// One rule for pricing a purchase order line, so the Finance email,
// the order list and QuickBooks agree to the cent.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { lineCents, lineAmount, orderTotal } from '../src/utils/poMoney.js';

describe('a line is rounded half up to the cent', () => {
  it('rounds 2.5 x 33.33 = 83.325 up, not down to a floating-point 83.32', () => {
    expect(2.5 * 33.33).toBeLessThan(83.325);     // the trap: the raw product is just under
    expect(lineAmount(2.5, 33.33)).toBe(83.33);
  });

  it('accepts the strings Postgres numeric columns arrive as', () => {
    expect(lineAmount('2.500', '33.33')).toBe(83.33);
    expect(lineCents('100.000', '12.50')).toBe(125000);
  });

  it('keeps exact amounts exact', () => {
    expect(lineAmount(100, 12.5)).toBe(1250);
    expect(lineAmount(4, 150)).toBe(600);
  });

  it('rounds a sub-cent remainder below half down and at half up', () => {
    expect(lineAmount(1.001, 1)).toBe(1);         // 1.001 -> 1.00
    expect(lineAmount(1.005, 1)).toBe(1.01);      // exactly half -> up
    expect(lineAmount(0.333, 1)).toBe(0.33);
  });

  it('counts a missing price as nothing, not as unknown', () => {
    expect(lineAmount(2.25, null)).toBe(0);
    expect(lineAmount(2.25, undefined)).toBe(0);
  });
});

describe('an order total is the sum of its rounded lines', () => {
  it('is R 1 333.33 for the order that used to show 1 333.32 in one place and .33 in another', () => {
    const lines = [{ quantity: 100, unitPrice: 12.5 }, { quantity: 2.5, unitPrice: 33.33 }];
    expect(orderTotal(lines)).toBe(1333.33);
    // ...and it equals the printed lines added up
    expect(lineAmount(100, 12.5) + lineAmount(2.5, 33.33)).toBeCloseTo(orderTotal(lines), 10);
  });

  it('rounds each line first, then adds', () => {
    const lines = [{ quantity: 1.005, unitPrice: 1 }, { quantity: 1.005, unitPrice: 1 }, { quantity: 1.005, unitPrice: 1 }];
    expect(orderTotal(lines)).toBe(3.03);          // 3 x 1.01
  });

  it('is nothing for an order with no lines', () => {
    expect(orderTotal([])).toBe(0);
  });
});
