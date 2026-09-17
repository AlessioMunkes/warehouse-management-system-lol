// ─────────────────────────────────────────────────────────────
// src/tests/QuantityFormat.test.js
// @sentinel script-54-quantity-format
//
// pg returns `numeric` columns as strings with their full scale, so a
// crate of butternut reaches the client as "1.000". The gate's Form
// mode put that straight into the number box the worker then had to
// retype.
//
// The rule these pin: trim the tail, never round. A whole number
// prints whole; a decanted 2.5 kg stays 2.5, because rounding a mass
// at the display layer would put a wrong figure on a dispatch note.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { fmtQty, qtyInput, qty } from '../lib/quantity';

describe('quantity formatting', () => {
  it('prints whole numbers whole, however pg sent them', () => {
    expect(fmtQty('1.000')).toBe('1');
    expect(fmtQty('30.000')).toBe('30');
    expect(fmtQty(30)).toBe('30');
    expect(fmtQty('1.000', 'crate')).toBe('1 crate');
  });

  it('keeps a real decimal, because weights are real', () => {
    expect(fmtQty('2.500')).toBe('2.5');
    expect(fmtQty('0.750', 'kg')).toBe('0.75 kg');
  });

  it('shows a dash for nothing, and an empty box for an input', () => {
    expect(fmtQty(null)).toBe('—');
    expect(fmtQty('')).toBe('—');
    expect(qtyInput(null)).toBe('');
    expect(qtyInput('1.000')).toBe('1');
  });

  it('qty numbers a pg string without losing it', () => {
    expect(qty('12.500')).toBe(12.5);
    expect(qty('not a number')).toBe(null);
  });
});
