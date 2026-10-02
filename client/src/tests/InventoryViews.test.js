// ─────────────────────────────────────────────────────────────
// src/tests/InventoryViews.test.js
//
// The rules behind the inventory tabs, filters and badges. Pure
// functions, so the dates are passed in rather than read off the clock.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  countViews, daysBetween, expiryLabel, expiryState, filterProducts, isIdle,
  stockStatus, todaySast, viewById,
} from '../features/InventoryManagement/inventoryViews';

const NOW = new Date('2026-10-02T10:00:00+02:00');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const p = (over) => ({
  id: 1, name: 'Rice', sku: 'RICE-10', onHand: 10, committed: 0, available: 10, reorderAt: 5,
  isShortfall: false, isLowStock: false, lastMovementAt: daysAgo(1), earliestExpiry: null, ...over,
});

describe('stockStatus', () => {
  it('calls a shortfall a shortfall even though the server also flags it low', () => {
    expect(stockStatus(p({ isShortfall: true, isLowStock: true }))).toBe('shortfall');
  });

  it('separates low stock from in stock', () => {
    expect(stockStatus(p({ isLowStock: true }))).toBe('low_stock');
    expect(stockStatus(p())).toBe('in_stock');
  });
});

describe('dates', () => {
  it('takes today in Cape Town, not UTC', () => {
    // 01:00 SAST on the 2nd is still the 1st in UTC.
    expect(todaySast(new Date('2026-10-01T23:00:00Z'))).toBe('2026-10-02');
  });

  it('counts whole days between two days', () => {
    expect(daysBetween('2026-10-02', '2026-11-01')).toBe(30);
    expect(daysBetween('2026-10-02', '2026-10-01')).toBe(-1);
  });
});

describe('expiryState', () => {
  const today = '2026-10-02';

  it('is soon up to and including thirty days out', () => {
    expect(expiryState('2026-11-01', today)).toEqual({ status: 'soon', daysLeft: 30 });
    expect(expiryState('2026-11-02', today).status).toBe('ok');
  });

  it('is expired once the day has passed, and says how long ago', () => {
    const state = expiryState('2026-09-25', today);
    expect(state.status).toBe('expired');
    expect(expiryLabel(state)).toBe('Expired 7 days ago');
  });

  it('has nothing to say about a product with no expiry recorded', () => {
    expect(expiryState(null, today)).toBeNull();
  });

  it('reads today and tomorrow as words', () => {
    expect(expiryLabel(expiryState(today, today))).toBe('Expires today');
    expect(expiryLabel(expiryState('2026-10-03', today))).toBe('Expires tomorrow');
  });
});

describe('isIdle', () => {
  it('is idle at sixty days without a movement, not before', () => {
    expect(isIdle(p({ lastMovementAt: daysAgo(60) }), NOW)).toBe(true);
    expect(isIdle(p({ lastMovementAt: daysAgo(59) }), NOW)).toBe(false);
  });

  it('counts stock that has never moved as idle, but not an empty catalogue entry', () => {
    expect(isIdle(p({ lastMovementAt: null, onHand: 12 }), NOW)).toBe(true);
    expect(isIdle(p({ lastMovementAt: null, onHand: 0 }), NOW)).toBe(false);
  });
});

describe('views', () => {
  const products = [
    p({ id: 1, name: 'Rice' }),
    p({ id: 2, name: 'Beans', isLowStock: true }),
    p({ id: 3, name: 'Lentils', isShortfall: true, isLowStock: true }),
    p({ id: 4, name: 'Pilchards', earliestExpiry: '2026-10-09' }),
    p({ id: 5, name: 'Oats', lastMovementAt: daysAgo(64) }),
  ];

  it('counts every view', () => {
    expect(countViews(products, NOW)).toEqual({ all: 5, lowstock: 1, shortfall: 1, expiring: 1, idle: 1 });
  });

  it('falls back to All for an unknown ?status=', () => {
    expect(viewById('nonsense').id).toBe('all');
    expect(viewById(null).id).toBe('all');
  });

  it('applies view, filters and search together', () => {
    const rows = filterProducts([
      p({ id: 1, name: 'Rice', committed: 3 }),
      p({ id: 2, name: 'Rice flour', committed: 0 }),
      p({ id: 3, name: 'Beans', sku: 'BEA-001', committed: 3 }),
    ], { view: 'all', filters: ['committed'], search: 'rice', now: NOW });
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('searches SKU as well as name', () => {
    expect(filterProducts([p({ sku: 'LEN-001' })], { search: 'len-0', now: NOW })).toHaveLength(1);
  });
});
