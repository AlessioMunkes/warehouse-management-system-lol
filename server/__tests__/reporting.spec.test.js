// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.spec.test.js
//
// The validator is the security boundary for the AI layer, so it is
// tested without mocks and without a database. Every assertion here
// is a thing a hallucinating or prompt-injected model might try.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { validateSpec } from '../src/features/reporting/specValidator.js';
import {
  METRIC_IDS, MAX_RANGE_DAYS, MAX_RANK_LIMIT, describeSpec,
} from '../src/features/reporting/reportCatalog.js';

const range = { from: '2026-06-01', to: '2026-08-01' };

describe('validateSpec — accepts valid specs', () => {
  it('fills in the default dimension and chart type', () => {
    const spec = validateSpec({ metric: 'children_reached', dateRange: range });
    expect(spec.metric).toBe('children_reached');
    expect(spec.dimension).toBe('none');
    expect(spec.chartType).toBe('number');
  });

  it('defaults ranked metrics to a limit', () => {
    const spec = validateSpec({ metric: 'repeat_non_collections', dateRange: range });
    expect(spec.limit).toBe(10);
  });

  it('caps an oversized limit rather than rejecting it', () => {
    const spec = validateSpec({ metric: 'repeat_non_collections', dateRange: range, limit: 5000 });
    expect(spec.limit).toBe(MAX_RANK_LIMIT);
  });

  it('every catalog metric validates with its own defaults', () => {
    for (const id of METRIC_IDS) {
      expect(() => validateSpec({ metric: id, dateRange: range })).not.toThrow();
    }
  });
});

describe('validateSpec — rejects what the AI layer might invent', () => {
  it('rejects an unknown metric', () => {
    expect(() => validateSpec({ metric: 'total_donor_emails', dateRange: range }))
      .toThrow(/Unknown report/);
  });

  it('rejects a dimension the metric does not declare', () => {
    expect(() => validateSpec({ metric: 'decanting_wastage', dimension: 'ecd_centre', dateRange: range }))
      .toThrow(/cannot be broken down/);
  });

  it('rejects a filter the metric does not declare', () => {
    expect(() => validateSpec({ metric: 'decanting_wastage', dateRange: range, filters: { cohort: 'week1' } }))
      .toThrow(/cannot be filtered/);
  });

  it('rejects a cohort value outside the enum', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: range, filters: { cohort: 'tuesday' } }))
      .toThrow(/must be one of/);
  });

  it('rejects a reversed date range', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: '2026-08-01', to: '2026-06-01' } }))
      .toThrow(/on or before/);
  });

  it('rejects a range wider than the cap', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: '2000-01-01', to: '2026-01-01' } }))
      .toThrow(new RegExp(String(MAX_RANGE_DAYS)));
  });

  it('rejects a non-existent calendar date', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: '2026-02-30', to: '2026-03-01' } }))
      .toThrow(/not a real date/);
  });

  it('rejects SQL in a date field', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: "2026-01-01'; DROP TABLE users;--", to: '2026-02-01' } }))
      .toThrow(/YYYY-MM-DD/);
  });

  it('rejects a non-integer id filter', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: range, filters: { ecd_id: '3 OR 1=1' } }))
      .toThrow(/whole number/);
  });

  it('drops undeclared keys instead of passing them through', () => {
    const spec = validateSpec({ metric: 'dispatch_volume', dateRange: range, rawSql: 'SELECT 1' });
    expect(spec.rawSql).toBeUndefined();
  });
});

describe('describeSpec', () => {
  it('restates a spec in plain English', () => {
    const spec = validateSpec({
      metric: 'repeat_non_collections',
      dateRange: range,
      filters: { cohort: 'week1' },
    });
    const text = describeSpec(spec);
    expect(text).toContain('Repeat non-collections');
    expect(text).toContain('week1');
    expect(text).toContain('2026-06-01');
  });
});
