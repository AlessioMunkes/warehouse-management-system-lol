import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/repositories/decanting.repository.js', () => ({ default: {
  createDecanting: vi.fn(async x=>x), getDecantingRecords: vi.fn(), getDecantingById: vi.fn(), getWeeklyProcurementReport: vi.fn() }}));
const { default: svc } = await import('../src/services/decanting.service.js');

// Mirror of client/src/features/decanting/bagSizes.js
const sizeLabelToKg = (l) => String(l).trim().endsWith('kg') ? parseFloat(l) : parseFloat(l)/1000;
const sizesToKg = (a) => Array.isArray(a) ? a.map(sizeLabelToKg) : undefined;
const STANDARD_SIZES = ['2kg','1kg','500g'];

describe('client -> server payload contract', () => {
  it('rejects raw display labels (the bug seen in the browser)', () => {
    expect(() => svc.calculateDecantingPlan({
      selectedSizes: STANDARD_SIZES, items: [{ productId: 1, requiredKg: 25 }],
    })).toThrow('Bag sizes must be positive numbers.');
  });

  it('accepts the converted payload the page now sends', () => {
    const { plans, summary } = svc.calculateDecantingPlan({
      selectedSizes: sizesToKg(STANDARD_SIZES),
      items: [
        { productId: 1, productName: 'Rice',  requiredKg: 25, actualBulkKg: 24 },
        { productId: 2, productName: 'Oats',  requiredKg: 50, selectedSizes: sizesToKg(['1kg','500g']) },
      ],
    });
    expect(plans[0].bags).toEqual({ '2kg': 12, '1kg': 0, '500g': 0 });
    expect(plans[1].sizesKg).toEqual([1, 0.5]);
    expect(summary.withinMargin).toBe(true);
  });

  it('every standard label converts to a positive number', () => {
    for (const kg of sizesToKg(STANDARD_SIZES)) {
      expect(Number.isFinite(kg)).toBe(true);
      expect(kg).toBeGreaterThan(0);
    }
    expect(sizesToKg(STANDARD_SIZES)).toEqual([2, 1, 0.5]);
  });
});