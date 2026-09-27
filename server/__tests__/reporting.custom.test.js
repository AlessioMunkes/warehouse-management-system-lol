// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.custom.test.js
//
// Custom reports ("how many X by Y"). The rule that matters: the
// request only ever NAMES things from customQuery.js's lists, and the
// SQL is written here. Unknown names are refused, filter values are
// checked against their allowed list and passed as parameters, and
// nothing from the request reaches the SQL text.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  DATASETS, validateCustom, buildCustomSql, describeCustom, runCustom, describeDatasets,
} from '../src/features/reporting/customQuery.js';

const range = { from: '2026-07-01', to: '2026-09-27' };
const spec = (custom, dateRange = range) => ({ custom, dateRange });

describe('what a custom request may name', () => {
  it('refuses an unknown dataset, grouping, measure or filter', () => {
    expect(() => validateCustom(spec({ dataset: 'users' }))).toThrow(/Unknown dataset/);
    expect(() => validateCustom(spec({ dataset: 'purchase_orders', groupBy: ['password_hash'] }))).toThrow(/not a way to group/);
    expect(() => validateCustom(spec({ dataset: 'purchase_orders', measure: 'sum_everything' }))).toThrow(/not a measure/);
    expect(() => validateCustom(spec({ dataset: 'donations', filters: { donor_name: 'x' } }))).toThrow(/not a filter/);
  });

  it('only accepts listed values for a status filter', () => {
    expect(() => validateCustom(spec({ dataset: 'purchase_orders', filters: { status: "x' OR 1=1 --" } }))).toThrow(/is not a status/);
    expect(validateCustom(spec({ dataset: 'purchase_orders', filters: { status: 'returned' } })).custom.filters).toEqual({ status: 'returned' });
  });

  it('only accepts a whole number for an id filter', () => {
    expect(() => validateCustom(spec({ dataset: 'deliveries', filters: { supplier_id: '1; DROP TABLE users' } }))).toThrow(/must be an id/);
  });

  it('allows at most two different groupings', () => {
    expect(() => validateCustom(spec({ dataset: 'picking_slips', groupBy: ['status', 'cohort', 'month'] }))).toThrow(/at most two/);
    expect(() => validateCustom(spec({ dataset: 'picking_slips', groupBy: ['status', 'status'] }))).toThrow(/different/);
  });

  it('needs a period for dated data, and ignores one for "as it stands" data', () => {
    expect(() => validateCustom(spec({ dataset: 'collections' }, null))).toThrow(/period/);
    expect(validateCustom(spec({ dataset: 'beneficiaries', groupBy: ['active'] })).dateRange).toBeUndefined();
  });
});

describe('the SQL', () => {
  it('puts filter values and dates in parameters, never in the text', () => {
    const v = validateCustom(spec({ dataset: 'purchase_orders', groupBy: ['status'], filters: { status: 'returned' } }));
    const { sql, params } = buildCustomSql(v);
    expect(params).toEqual(['2026-07-01', '2026-09-27', 'returned']);
    expect(sql).not.toMatch(/returned|2026-07-01/);
    expect(sql).toMatch(/po\.status = \$3/);
  });

  it('never exposes donor, caller or contact columns as a grouping or filter', () => {
    // finance_email_status is whether the PO email went, not an address.
    const personal = /donor_(name|first|last|contact|cellphone|address|identification)|caller_|contact_|mobile|(?<!finance_)email|full_name|password/;
    for (const d of Object.values(DATASETS)) {
      for (const g of Object.values(d.groups)) expect(g.sql, g.label).not.toMatch(personal);
      for (const f of Object.values(d.filters)) expect(f.sql, f.label).not.toMatch(personal);
    }
  });

  it('comes back in the shape a report has, with a readable description', async () => {
    const v = validateCustom(spec({ dataset: 'collections', groupBy: ['status'] }));
    const fake = async () => ({ rows: [{ label: 'collected', value: 14 }, { label: 'not_collected', value: 14 }] });
    const r = await runCustom(v, fake);
    expect(r.series).toEqual([{ label: 'collected', value: 14 }, { label: 'not_collected', value: 14 }]);
    expect(r.total).toBe(28);
    expect(r.meta.unit).toBe('pallets');
    expect(r.spec.dimension).toBe('custom');
    expect(describeCustom(v)).toBe('Collections at the gate by outcome, 2026-07-01 to 2026-09-27');
  });

  it('describes every dataset for the builder without leaking SQL', () => {
    const json = JSON.stringify(describeDatasets());
    expect(json).not.toMatch(/SELECT|JOIN|COALESCE/);
    expect(describeDatasets().length).toBe(Object.keys(DATASETS).length);
  });
});
