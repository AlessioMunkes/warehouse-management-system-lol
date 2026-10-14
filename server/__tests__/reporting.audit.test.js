// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.audit.test.js
//
// What the reporting audit found, pinned so it stays fixed:
//   - food going out is dated by the day it left, not the day booked
//   - low stock uses the Inventory screen's rule
//   - the total of a rate is the overall rate, not the mean of the bars
//   - each report names its own left-out lines
//   - a moment is read in the warehouse's own day
//   - the areas that had no report now have one
// The queries are captured from a stand-in for the database; nothing
// is connected.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pool = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../src/config/db.js', () => ({ default: pool }));

const { default: repo } = await import('../src/repositories/reporting.repository.js');
const { default: service } = await import('../src/services/reporting.service.js');
const { default: cache } = await import('../src/features/reporting/reportCache.js');
const { DATASETS, buildCustomSql, validateCustom } = await import('../src/features/reporting/customQuery.js');
const { matchQuestion } = await import('../src/features/reporting/keywordFallback.js');
const { METRICS } = await import('../src/features/reporting/reportCatalog.js');

const RANGE = { from: '2026-10-01', to: '2026-10-12' };
const lastSql = () => pool.query.mock.calls.at(-1)[0];
const allSql = () => pool.query.mock.calls.map((c) => c[0]).join('\n----\n');

beforeEach(() => { vi.clearAllMocks(); cache.clear(); pool.query.mockResolvedValue({ rows: [] }); });

describe('food going out is dated by the day it left', () => {
  const LEFT = /COALESCE\(\(\(de\.collected_at AT TIME ZONE 'Africa\/Johannesburg'\)::date\), ps\.dispatch_date\) BETWEEN \$1::date AND \$2::date/;

  it.each(['dispatchVolume', 'mealsEnabled', 'childrenReached', 'mealsServedByGroup', 'gateLoadVariance'])('%s', async (fn) => {
    await repo[fn]({ dimension: 'none', filters: {}, dateRange: RANGE });
    expect(lastSql()).toMatch(LEFT);
  });

  it('buckets a month and a weekday by that day too', async () => {
    await repo.dispatchVolume({ dimension: 'month', filters: {}, dateRange: RANGE });
    expect(lastSql()).toMatch(/to_char\(COALESCE\(\(\(de\.collected_at AT TIME ZONE/);
    await repo.dispatchVolume({ dimension: 'weekday', filters: {}, dateRange: RANGE });
    expect(lastSql()).not.toMatch(/to_char\(ps\.dispatch_date/);
  });

  it('leaves the planned-cycle reports on the booked day', async () => {
    for (const fn of ['collectionCompliance', 'lateCollectionRate']) {
      await repo[fn]({ dimension: 'none', filters: {}, dateRange: RANGE });
      expect(lastSql(), fn).toMatch(/ps\.dispatch_date BETWEEN \$1::date AND \$2::date/);
    }
  });
});

describe('low stock is the Inventory screen\'s rule', () => {
  it('takes off what is promised, and needs no reorder level to be set', async () => {
    await repo.lowStockItems({ filters: {}, limit: 10 });
    const sql = lastSql();
    expect(sql).toMatch(/COALESCE\(sl\.quantity_on_hand, 0\) - COALESCE\(c\.committed, 0\)\) <= COALESCE\(sl\.reorder_threshold, 0\)/);
    expect(sql).not.toMatch(/reorder_threshold > 0/);
  });
});

// Expiring stock is the deliveries estimated to still be on the shelf:
// see reporting.expiring.test.js.

describe('the total of a rate', () => {
  it('is the overall rate, weighing every order once', async () => {
    // Three suppliers; one sent a single late order.
    pool.query.mockImplementation(async (sql) => (/GROUP BY/.test(sql)
      ? { rows: [{ label: 'A', value: '0', orders: 1 }, { label: 'B', value: '85.7', orders: 7 }, { label: 'C', value: '85.7', orders: 7 }] }
      : { rows: [{ label: 'Total', value: '80.0', orders: 15 }] }));
    const report = await service.runReport({ metric: 'po_on_time_rate', dimension: 'supplier', filters: {}, dateRange: RANGE });
    expect(report.series).toHaveLength(3);
    expect(report.total).toBe(80);          // not (0 + 85.7 + 85.7) / 3 = 57.1
  });

  it('is still a plain sum for a quantity', async () => {
    pool.query.mockResolvedValue({ rows: [{ label: 'A', value: '10' }, { label: 'B', value: '32.5' }] });
    const report = await service.runReport({ metric: 'procurement_spend', dimension: 'supplier', filters: {}, dateRange: RANGE });
    expect(report.total).toBe(42.5);
  });

  it('is the figure itself when there is no breakdown', async () => {
    pool.query.mockResolvedValue({ rows: [{ label: 'Total', value: '59.62' }] });
    const report = await service.runReport({ metric: 'unit_price_trend', dimension: 'none', filters: {}, dateRange: RANGE });
    expect(report.total).toBe(59.62);
  });
});

describe('lines a kilogram report leaves out', () => {
  it('Goods received counts delivery lines, not dispatch lines', async () => {
    pool.query.mockImplementation(async (sql) => (/COUNT\(\*\)::int AS n/.test(sql) ? { rows: [{ n: 26 }] } : { rows: [{ label: 'Total', value: '282.5' }] }));
    const report = await service.runReport({ metric: 'goods_received', dimension: 'none', filters: {}, dateRange: RANGE });
    expect(report.meta).toMatchObject({ excludedLines: 26, excludedKind: 'delivery' });
    expect(allSql()).toMatch(/dni\.received_weight_kg IS NULL/);
    expect(allSql()).not.toMatch(/dispatch_event_lines/);
  });

  it('Food dispatched counts dispatch lines', async () => {
    pool.query.mockImplementation(async (sql) => (/COUNT\(\*\)::int AS n/.test(sql) ? { rows: [{ n: 3 }] } : { rows: [{ label: 'Total', value: '84' }] }));
    const report = await service.runReport({ metric: 'dispatch_volume', dimension: 'none', filters: {}, dateRange: RANGE });
    expect(report.meta).toMatchObject({ excludedLines: 3, excludedKind: 'dispatch' });
  });

  it('a report that is not in kilograms carries no such note', async () => {
    pool.query.mockResolvedValue({ rows: [{ label: 'Total', value: '30555' }] });
    const report = await service.runReport({ metric: 'procurement_spend', dimension: 'none', filters: {}, dateRange: RANGE });
    expect(report.meta.excludedLines).toBeUndefined();
  });
});

describe('stock value says what it could not price', () => {
  it('names the products with no unit cost', async () => {
    pool.query.mockImplementation(async (sql) => (/unit_cost IS NULL/.test(sql) ? { rows: [{ n: 16 }] } : { rows: [] }));
    const report = await service.runReport({ metric: 'stock_value', dimension: 'none', filters: {} });
    expect(report.meta.caveat).toMatch(/^16 products in stock have no unit cost/);
  });
});

describe('donations no longer carry a programme', () => {
  it('is not offered as a breakdown or a filter', () => {
    expect(METRICS.donation_value.dimensions).not.toContain('programme');
    expect(METRICS.donation_value.filters).not.toContain('programme_id');
  });
});

describe('custom reports', () => {
  it('read a recorded moment in the warehouse\'s own day', () => {
    for (const id of ['purchase_orders', 'donations', 'community_requests', 'stock_movements', 'messages', 'activity', 'visits']) {
      const spec = validateCustom({ custom: { dataset: id, groupBy: ['month'], measure: 'count', filters: {} }, dateRange: RANGE });
      const { sql } = buildCustomSql(spec);
      expect(sql, id).toMatch(/AT TIME ZONE 'Africa\/Johannesburg'\)\)::date BETWEEN/);
      expect(sql, id).toMatch(/date_trunc\('month', \([a-z]+\.[a-z_]+ AT TIME ZONE 'Africa\/Johannesburg'\)\)/);
    }
  });

  it('weigh a delivery line the way Goods received does', () => {
    expect(DATASETS.delivery_lines.measures.kg.sql).toMatch(/WHEN dni\.unit = 'kg' THEN dni\.received_quantity/);
  });

  it('cover the areas that had no report', () => {
    for (const id of ['decanting', 'stock_counts', 'kits', 'reminders', 'messages', 'activity', 'visits', 'suppliers']) {
      expect(DATASETS[id], id).toBeTruthy();
      expect(Object.keys(DATASETS[id].measures), id).toContain('count');
    }
  });

  it('keep kits a standing list, so an old idle kit is still counted', () => {
    expect(DATASETS.kits.date).toBeNull();
    expect(DATASETS.kits.filters.used.values).toContain('nothing logged yet');
  });

  it('never group or filter the new datasets by a person', () => {
    const personal = /owner_name|full_name|recipient|actor_id|first_name|last_name|email|phone/i;
    for (const id of ['kits', 'messages', 'activity', 'visits', 'reminders', 'suppliers']) {
      const d = DATASETS[id];
      for (const g of [...Object.values(d.groups), ...Object.values(d.filters)]) expect(g.sql, id).not.toMatch(personal);
    }
  });
});

describe('without the AI', () => {
  const TODAY = '2026-10-12';
  it('a question that names a kind of record is a count of those records', () => {
    expect(matchQuestion('Did the collection reminders go out last week?', TODAY)).toMatchObject({ kind: 'custom', id: 'reminders' });
    expect(matchQuestion('How many emails sent failed this month', TODAY)).toMatchObject({ kind: 'custom', id: 'messages' });
    expect(matchQuestion('how did our stock counts go this year', TODAY)).toMatchObject({ kind: 'custom', id: 'stock_counts' });
  });

  it('a prepared report still wins when the question is about one', () => {
    expect(matchQuestion('Which purchase orders are overdue?', TODAY).spec.metric).toBe('overdue_purchase_orders');
    expect(matchQuestion('food dispatched last month', TODAY).spec.metric).toBe('dispatch_volume');
  });
});
