// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.records.test.js
//
// The widest and the deepest the reports go:
//   - every operational report can list the records it is made of
//   - a record list never names a donor, a caller or a volunteer
//   - nothing from a request reaches the SQL text
//   - the new breakdowns (day, product category, storage type) and
//     the new filters (statuses, categories) are real: declared in the
//     catalog, accepted by the validator, and built into the queries
// The queries are captured from a stand-in for the database.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pool = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../src/config/db.js', () => ({ default: pool }));

const { METRICS, FILTERS, DIMENSIONS } = await import('../src/features/reporting/reportCatalog.js');
const { validateSpec } = await import('../src/features/reporting/specValidator.js');
const { REPORT_RECORDS, buildRecordsSql, MAX_RECORDS } = await import('../src/repositories/reportingRecords.repository.js');
const { default: repo } = await import('../src/repositories/reporting.repository.js');
const { default: service } = await import('../src/services/reporting.service.js');
const { default: cache } = await import('../src/features/reporting/reportCache.js');

const RANGE = { from: '2026-10-01', to: '2026-10-12' };
const operational = Object.values(METRICS).filter((m) => !m.impactOnly);
const specFor = (m, dimension = m.dimensions[0], filters = {}) =>
  ({ metric: m.id, dimension, filters, ...(m.temporal === 'range' ? { dateRange: RANGE } : {}) });

beforeEach(() => { vi.clearAllMocks(); cache.clear(); pool.query.mockResolvedValue({ rows: [] }); });

describe('the records behind a report', () => {
  it('every operational report has a list', () => {
    for (const m of operational) expect(REPORT_RECORDS[m.id], m.id).toBeTruthy();
  });

  it('never shows a donor, a caller, a volunteer or a contact detail', () => {
    const personal = /donor_|caller_|full_name|volunteer_first|volunteer_last|volunteer_email|volunteer_phone|contact_|owner_name|signature|driver_name|password|\bemail\b/i;
    for (const m of operational) {
      const { sql } = buildRecordsSql(validateSpec(specFor(m)));
      expect(sql, m.id).not.toMatch(personal);
    }
  });

  it('puts the period and every filter in parameters, never in the text', () => {
    const m = METRICS.goods_received;
    // Straight to the builder, past the validator that would refuse this
    // value: even then it can only ever be a parameter.
    const { sql, params } = buildRecordsSql({ ...specFor(m, 'supplier'), filters: { supplier_id: 7, product_category: "Dry'; DROP TABLE x;--" } });
    expect(params).toEqual(['2026-10-01', '2026-10-12', 7, "Dry'; DROP TABLE x;--"]);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toMatch(/dn\.delivery_date BETWEEN \$1::date AND \$2::date/);
    expect(sql).toMatch(/dn\.supplier_id = \$3/);
  });

  it('caps the list and counts the whole', () => {
    const { sql, countSql } = buildRecordsSql(validateSpec(specFor(METRICS.stock_movement_volume)));
    expect(sql).toMatch(new RegExp(`LIMIT ${MAX_RECORDS}$`));
    expect(countSql).toMatch(/^SELECT COUNT\(\*\)::int AS n FROM stock_movements/);
  });

  it('leaves out a filter the records do not carry, and says so', () => {
    const { ignored, sql } = buildRecordsSql({ metric: 'collection_compliance', filters: { cohort: 'tuesday', product_id: 3 }, dateRange: RANGE });
    expect(ignored).toEqual(['product_id']);
    expect(sql).toMatch(/ps\.cohort = \$3::cohort_group/);
  });

  it('lists a live report whatever the period, on its own condition', () => {
    const { sql, params } = buildRecordsSql({ metric: 'overdue_purchase_orders', filters: {}, dateRange: null });
    expect(params).toEqual([]);
    expect(sql).toMatch(/po\.expected_delivery_date < /);
  });

  it('dates what left the warehouse by the day it left', () => {
    const { sql } = buildRecordsSql(validateSpec(specFor(METRICS.dispatch_volume)));
    expect(sql).toMatch(/COALESCE\(\(\(de\.collected_at AT TIME ZONE 'Africa\/Johannesburg'\)::date\), ps\.dispatch_date\) BETWEEN/);
  });

  it('narrows to one bar the way a drill does', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (/SELECT id FROM suppliers/.test(sql)) return { rows: [{ id: 9 }] };
      if (/COUNT\(\*\)::int AS n/.test(sql)) return { rows: [{ n: 2 }] };
      return { rows: [{ delivered: '2026-10-10', note: '#0024', supplier: 'Cape Dry Goods', product: 'Rice 2 kg', received: '4.000', unit: 'bag', value: '600.00' }] };
    });
    const out = await service.records({ spec: specFor(METRICS.goods_received, 'supplier'), label: 'Cape Dry Goods' });
    expect(out.title).toBe('Goods received: the delivery lines behind "Cape Dry Goods"');
    expect(out.total).toBe(2);
    expect(out.rows[0]).toMatchObject({ received: 4, value: 600, supplier: 'Cape Dry Goods' });
    const listSql = pool.query.mock.calls.map((c) => c[0]).find((s) => /FROM delivery_note_items/.test(s) && /LIMIT/.test(s));
    expect(listSql).toMatch(/dn\.supplier_id = \$3/);
  });

  it('narrows to one day when a day bar is opened', async () => {
    await service.records({ spec: specFor(METRICS.stock_movement_volume, 'day'), label: '2026-10-10' });
    const call = pool.query.mock.calls.find((c) => /FROM stock_movements/.test(c[0]) && /LIMIT/.test(c[0]));
    expect(call[1].slice(0, 2)).toEqual(['2026-10-10', '2026-10-10']);
  });
});

describe('breakdowns', () => {
  it('every breakdown a report declares exists and runs', async () => {
    // One empty row: the stock waterfall reads a single row of sums.
    pool.query.mockResolvedValue({ rows: [{}] });
    let ran = 0;
    for (const m of operational) {
      for (const d of m.dimensions) {
        expect(DIMENSIONS[d], `${m.id}/${d}`).toBeTruthy();
        const spec = validateSpec(specFor(m, d));
        await expect(repo[m.repoFn](spec), `${m.id}/${d}`).resolves.toBeDefined();
        ran += 1;
      }
    }
    expect(ran).toBeGreaterThan(170);
  });

  it('goes day by day on the reports a manager checks daily', () => {
    for (const id of ['dispatch_volume', 'goods_received', 'stock_movement_volume', 'procurement_spend', 'collection_compliance', 'purchase_order_pipeline', 'late_collection_rate', 'community_request_outcomes']) {
      expect(METRICS[id].dimensions, id).toContain('day');
    }
  });

  it('groups product reports by category and by storage type', async () => {
    for (const id of ['dispatch_volume', 'goods_received', 'stock_movement_volume', 'procurement_spend']) {
      expect(METRICS[id].dimensions, id).toEqual(expect.arrayContaining(['product_category', 'storage_type']));
    }
    await repo.goodsReceived(validateSpec(specFor(METRICS.goods_received, 'day')));
    expect(pool.query.mock.calls.at(-1)[0]).toMatch(/to_char\(dn\.delivery_date, 'YYYY-MM-DD'\)/);
    await repo.goodsReceived(validateSpec(specFor(METRICS.goods_received, 'product_category')));
    expect(pool.query.mock.calls.at(-1)[0]).toMatch(/COALESCE\(NULLIF\(TRIM\(p\.category\), ''\), 'Uncategorised'\)/);
  });
});

describe('filters', () => {
  it('every filter a report declares exists and reaches its query', async () => {
    const sample = { cohort: 'tuesday', beneficiary_kind: 'ecd', movement_type: 'received', donation_category: 'recipe_food' };
    let checked = 0;
    for (const m of operational) {
      for (const f of m.filters) {
        const def = FILTERS[f];
        expect(def, `${m.id}/${f}`).toBeTruthy();
        const value = def.values ? (sample[f] ?? def.values[0]) : def.text ? 'Some value' : 5;
        const spec = validateSpec(specFor(m, m.dimensions[0], { [f]: value }));
        pool.query.mockClear();
        pool.query.mockResolvedValue({ rows: [{}] });
        await repo[m.repoFn](spec);
        const used = pool.query.mock.calls.some((c) => (c[1] ?? []).includes(value));
        expect(used, `${m.id} ignores its ${f} filter`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(70);
  });

  it('a status or category filter is one plain value', () => {
    const ok = validateSpec(specFor(METRICS.purchase_order_pipeline, 'po_status', { po_status: 'partially_received' }));
    expect(ok.filters).toEqual({ po_status: 'partially_received' });
    for (const bad of ['a\nb', 'x'.repeat(81), 'a;b', '<script>', 12, ['a']]) {
      expect(() => validateSpec(specFor(METRICS.purchase_order_pipeline, 'po_status', { po_status: bad })), String(bad)).toThrow(/cannot filter by|not a value/);
    }
  });

  it('still refuses a filter the report does not declare', () => {
    expect(() => validateSpec(specFor(METRICS.volunteer_hours, 'month', { po_status: 'approved' }))).toThrow(/cannot be filtered/);
  });
});

describe('the catalog the page builds itself from', () => {
  it('describes every filter and says which reports list their records', () => {
    const catalog = service.getCatalog();
    expect(catalog.filterDefs.po_status).toEqual({ label: 'Order status', values: null, kind: 'text' });
    expect(catalog.filterDefs.supplier_id.kind).toBe('id');
    expect(catalog.filterDefs.cohort.kind).toBe('list');
    expect(catalog.metrics.find((m) => m.id === 'goods_received').records).toBe(true);
  });
});
