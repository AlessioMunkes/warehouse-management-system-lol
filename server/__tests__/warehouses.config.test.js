// ─────────────────────────────────────────────────────────────
// server/__tests__/warehouses.config.test.js
//
// Script 50: warehouse list and names from the environment, and the
// daily expiry sweep running once per warehouse.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseWarehouseNames, warehouseCodes, isMultiWarehouse, warehouseName, resetWarehouseNamesForTests,
} from '../src/config/warehouses.js';

afterEach(() => {
  delete process.env.WAREHOUSE_DB_URLS;
  delete process.env.WAREHOUSE_NAMES;
  resetWarehouseNamesForTests();
});

describe('warehouseCodes / isMultiWarehouse', () => {
  it('single-warehouse mode when WAREHOUSE_DB_URLS is unset', () => {
    delete process.env.WAREHOUSE_DB_URLS;
    expect(warehouseCodes()).toEqual([]);
    expect(isMultiWarehouse()).toBe(false);
  });

  it('lists configured codes in order and follows a changed variable', () => {
    process.env.WAREHOUSE_DB_URLS = '{"gauteng":"postgres://a","cpt":"postgres://b"}';
    expect(warehouseCodes()).toEqual(['gauteng', 'cpt']);
    expect(isMultiWarehouse()).toBe(true);
    process.env.WAREHOUSE_DB_URLS = '{"cpt":"postgres://b"}';
    expect(warehouseCodes()).toEqual(['cpt']);
  });
});

describe('parseWarehouseNames / warehouseName', () => {
  it('returns {} when unset', () => {
    expect(parseWarehouseNames(undefined)).toEqual({});
    expect(parseWarehouseNames(' ')).toEqual({});
  });

  it('trims names and falls back to the code', () => {
    process.env.WAREHOUSE_NAMES = '{"cpt":"  Cape Town "}';
    expect(warehouseName('cpt')).toBe('Cape Town');
    expect(warehouseName('gauteng')).toBe('gauteng');
  });

  it.each([
    ['nope', /not valid JSON/],
    ['["a"]', /JSON object/],
    ['{"CPT":"x"}', /not a valid warehouse code/],
    ['{"cpt":""}', /non-empty name/],
    [`{"cpt":"${'x'.repeat(61)}"}`, /at most 60/],
  ])('rejects %s', (raw, pattern) => {
    expect(() => parseWarehouseNames(raw)).toThrow(pattern);
  });
});

describe('expiry warning job in multi-warehouse mode', () => {
  const seen = [];
  let ctx; // the warehouseContext instance the freshly imported job uses
  const runExpiryCheck = vi.fn(async () => {
    seen.push(ctx.currentWarehouse());
    if (ctx.currentWarehouse() === 'gauteng' && runExpiryCheck.failGauteng) throw new Error('down');
    return { checked: 1, notified: 0 };
  });

  let job;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T08:00:00Z'));
    vi.resetModules();
    vi.doMock('../src/services/expiryWarning.service.js', () => ({ default: { runExpiryCheck } }));
    ({ default: job } = await import('../src/jobs/expiryWarning.job.js'));
    ctx = await import('../src/config/warehouseContext.js');
    seen.length = 0;
    runExpiryCheck.mockClear();
    runExpiryCheck.failGauteng = false;
    process.env.WAREHOUSE_DB_URLS = '{"cpt":"postgres://a","gauteng":"postgres://b"}';
  });

  afterEach(() => {
    job.stopExpiryWarningJob();
    vi.useRealTimers();
    vi.doUnmock('../src/services/expiryWarning.service.js');
  });

  it('runs once per warehouse, inside that warehouse', async () => {
    job.startExpiryWarningJob();
    await vi.waitFor(() => expect(seen).toEqual(['cpt', 'gauteng']));
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(seen).toEqual(['cpt', 'gauteng']); // not again the same day
  });

  it('retries only the warehouse that failed', async () => {
    runExpiryCheck.failGauteng = true;
    job.startExpiryWarningJob();
    await vi.waitFor(() => expect(seen).toEqual(['cpt', 'gauteng']));
    runExpiryCheck.failGauteng = false;
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(seen).toEqual(['cpt', 'gauteng', 'gauteng']);
  });
});
