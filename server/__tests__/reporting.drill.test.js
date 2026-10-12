// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.drill.test.js
//
// Drill-down plans: a bar for a thing becomes the same report over
// time filtered to it; a month becomes its weeks; and nothing is
// offered that would not run (snapshots, filters the report lacks).
// Also: the new diagram reports are wired to their diagrams.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { canDrill, drillOptions, planDrill } from '../src/features/reporting/drillDown.js';
import { validateSpec } from '../src/features/reporting/specValidator.js';
import { getMetric, METRICS, DIMENSIONS } from '../src/features/reporting/reportCatalog.js';

const RANGE = { from: '2026-06-01', to: '2026-09-27' };

describe('what can be drilled', () => {
  it('offers a drill only where the report can filter to the bar and show it over time', () => {
    expect(canDrill(getMetric('receiving_discrepancy_rate'), 'supplier')).toBe(true);
    expect(canDrill(getMetric('dispatch_volume'), 'month')).toBe(true);
    expect(canDrill(getMetric('stock_on_hand'), 'supplier')).toBe(false);   // not a breakdown it has
    expect(canDrill(getMetric('dispatch_volume'), 'weekday')).toBe(false);
    expect(canDrill(getMetric('purchase_order_pipeline'), 'po_status')).toBe(true);  // a status filters by its own text
    expect(canDrill(getMetric('adjustment_reasons'), 'reason')).toBe(false);          // free text does not
  });

  it('opens a bar every way the report can: over time, and by each other breakdown', () => {
    const ids = (metric, dimension, dateRange = RANGE) => drillOptions(getMetric(metric), { dimension, dateRange }).map((o) => o.id);
    expect(ids('goods_received', 'supplier')).toEqual(['month', 'product', 'product_category', 'storage_type']);
    expect(ids('goods_received', 'month')).toEqual(['week', 'day', 'supplier', 'product', 'product_category', 'storage_type']);
    expect(ids('goods_received', 'week')).toEqual(['day', 'supplier', 'product', 'product_category', 'storage_type']);
    expect(ids('goods_received', 'day')).toEqual(['supplier', 'product', 'product_category', 'storage_type']);
    expect(ids('dispatch_volume', 'ecd_centre')).toEqual(['month', 'cohort', 'product', 'programme', 'beneficiary', 'product_category', 'storage_type']);
    // A fortnight or less goes day by day.
    expect(ids('goods_received', 'supplier', { from: '2026-10-01', to: '2026-10-12' })[0]).toBe('day');
    // A short period goes week by week.
    expect(ids('goods_received', 'supplier', { from: '2026-09-01', to: '2026-09-27' })[0]).toBe('week');
  });

  it('opens a product on a live report in the report that has its history', () => {
    for (const id of ['stock_on_hand', 'low_stock_items', 'days_of_cover', 'expiring_stock']) {
      expect(drillOptions(getMetric(id), { dimension: 'product' }).map((o) => o.id), id).toContain('across:stock_movement_volume');
    }
    const plan = planDrill(getMetric('low_stock_items'), { metric: 'low_stock_items', dimension: 'product', filters: {} }, 'Rice 2 kg', null, '2026-10-12');
    expect(plan.spec).toEqual({ metric: 'stock_movement_volume', dimension: 'movement_type', filters: {}, dateRange: { from: '2026-07-14', to: '2026-10-12' } });
    expect(plan.lookup).toEqual({ table: 'products', name: 'Rice 2 kg' });
    expect(plan.filter).toBe('product_id');
  });

  // The guard for the whole feature: every button the page can show,
  // on every report and breakdown, plans a report the validator accepts.
  it('every drill it offers is a report that would really run', () => {
    let checked = 0;
    for (const m of Object.values(METRICS)) {
      for (const dim of m.dimensions) {
        const parent = { metric: m.id, dimension: dim, filters: {}, ...(m.temporal === 'range' ? { dateRange: RANGE } : {}) };
        const label = dim === 'month' ? '2026-07' : dim === 'week' ? '2026-W30' : dim === 'day' ? '2026-07-15' : dim === 'cohort' ? 'tuesday'
          : dim === 'beneficiary' ? 'ecd' : dim === 'movement_type' ? 'received' : dim === 'category' ? 'recipe_food' : 'X';
        for (const option of drillOptions(m, parent)) {
          const where = `${m.id}/${dim} -> ${option.id}`;
          const plan = planDrill(m, parent, label, option.id, '2026-10-12');
          expect(plan, where).toBeTruthy();
          const target = getMetric(plan.spec.metric);
          expect(target.dimensions, where).toContain(plan.spec.dimension);
          if (plan.filter) expect(target.filters, where).toContain(plan.filter);
          // A looked-up id stands in for the name the service resolves.
          const spec = plan.lookup ? { ...plan.spec, filters: { ...plan.spec.filters, [plan.filter]: 1 } } : plan.spec;
          expect(() => validateSpec(spec), where).not.toThrow();
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe('the plan', () => {
  it('a supplier bar → that supplier by week (short range), looked up by name', () => {
    const plan = planDrill(getMetric('receiving_discrepancy_rate'),
      { metric: 'receiving_discrepancy_rate', dimension: 'supplier', filters: {}, dateRange: { from: '2026-08-01', to: '2026-09-27' } },
      'Bokomo Foods Distribution');
    expect(plan.lookup).toEqual({ table: 'suppliers', name: 'Bokomo Foods Distribution' });
    expect(plan.filter).toBe('supplier_id');
    expect(plan.spec.dimension).toBe(getMetric('receiving_discrepancy_rate').dimensions.includes('week') ? 'week' : 'month');
  });

  it('a month bar → its weeks, clipped to the report period', () => {
    const plan = planDrill(getMetric('dispatch_volume'), { metric: 'dispatch_volume', dimension: 'month', filters: {}, dateRange: RANGE }, '2026-06');
    expect(plan.spec).toMatchObject({ dimension: 'week', dateRange: { from: '2026-06-01', to: '2026-06-30' } });
    const clipped = planDrill(getMetric('dispatch_volume'), { metric: 'dispatch_volume', dimension: 'month', filters: {}, dateRange: RANGE }, '2026-09');
    expect(clipped.spec.dateRange).toEqual({ from: '2026-09-01', to: '2026-09-27' });
  });

  it('a fixed value (cohort) is used as it is, and existing filters are kept', () => {
    const plan = planDrill(getMetric('dispatch_volume'),
      { metric: 'dispatch_volume', dimension: 'cohort', filters: { beneficiary_kind: 'ecd' }, dateRange: RANGE }, 'tuesday');
    expect(plan.lookup).toBeUndefined();
    expect(plan.spec.filters).toEqual({ beneficiary_kind: 'ecd', cohort: 'tuesday' });
  });

  it('a month bar → any other breakdown, inside that month', () => {
    const plan = planDrill(getMetric('goods_received'), { metric: 'goods_received', dimension: 'month', filters: { product_id: 4 }, dateRange: RANGE }, '2026-07', 'supplier');
    expect(plan.spec).toEqual({ metric: 'goods_received', dimension: 'supplier', filters: { product_id: 4 }, dateRange: { from: '2026-07-01', to: '2026-07-31' } });
  });

  it('a week bar → a breakdown inside that Monday to Sunday', () => {
    const plan = planDrill(getMetric('goods_received'), { metric: 'goods_received', dimension: 'week', filters: {}, dateRange: { from: '2026-09-01', to: '2026-10-12' } }, '2026-W41', 'product');
    expect(plan.spec.dateRange).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(plan.spec.dimension).toBe('product');
  });

  it('a supplier bar → that supplier split by product, keeping the period', () => {
    const plan = planDrill(getMetric('procurement_spend'), { metric: 'procurement_spend', dimension: 'supplier', filters: {}, dateRange: RANGE }, 'Cape Dry Goods', 'product');
    expect(plan.spec).toMatchObject({ dimension: 'product', dateRange: RANGE });
    expect(plan.lookup).toEqual({ table: 'suppliers', name: 'Cape Dry Goods' });
  });

  it('a week bar → its days; a day bar → what happened that day', () => {
    const week = planDrill(getMetric('goods_received'), { metric: 'goods_received', dimension: 'week', filters: {}, dateRange: { from: '2026-09-01', to: '2026-10-12' } }, '2026-W41');
    expect(week.spec).toMatchObject({ dimension: 'day', dateRange: { from: '2026-10-05', to: '2026-10-11' } });
    const day = planDrill(getMetric('goods_received'), { metric: 'goods_received', dimension: 'day', filters: {}, dateRange: { from: '2026-10-05', to: '2026-10-11' } }, '2026-10-10', 'supplier');
    expect(day.spec).toMatchObject({ dimension: 'supplier', dateRange: { from: '2026-10-10', to: '2026-10-10' } });
  });

  it('a status bar → that status, by its own text', () => {
    const plan = planDrill(getMetric('purchase_order_pipeline'), { metric: 'purchase_order_pipeline', dimension: 'po_status', filters: {}, dateRange: RANGE }, 'partially_received', 'supplier');
    expect(plan.spec.filters).toEqual({ po_status: 'partially_received' });
    expect(plan.spec.dimension).toBe('supplier');
    expect(plan.lookup).toBeUndefined();
  });

  it('refuses a way of opening the bar that the report does not offer', () => {
    expect(planDrill(getMetric('goods_received'), { metric: 'goods_received', dimension: 'supplier', filters: {}, dateRange: RANGE }, 'X', 'cohort')).toBeNull();
  });

  it('refuses a label that is not a month on a month chart', () => {
    expect(planDrill(getMetric('dispatch_volume'), { metric: 'dispatch_volume', dimension: 'month', filters: {}, dateRange: RANGE }, 'July')).toBeNull();
  });
});

describe('the new diagrams in the catalog', () => {
  it('declares funnels on real status breakdowns', () => {
    for (const m of Object.values(METRICS).filter((x) => x.funnel)) {
      expect(m.dimensions).toContain(m.funnel.dimension);
      expect(m.funnel.stages.length).toBeGreaterThanOrEqual(3);
    }
    expect(getMetric('purchase_order_pipeline').funnel).toBeTruthy();
  });

  it('has the busy-day breakdowns and the stock flow and cover reports', () => {
    expect(DIMENSIONS.weekday && DIMENSIONS.week_weekday).toBeTruthy();
    expect(getMetric('dispatch_volume').dimensions).toEqual(expect.arrayContaining(['weekday', 'week_weekday']));
    expect(getMetric('stock_flow').waterfall).toBe(true);
    expect(getMetric('days_of_cover').rag).toEqual({ red: 14, amber: 30 });
    expect(getMetric('donation_routing').dimensions).toContain(getMetric('donation_routing').flows);
  });
});

describe('related diagrams', () => {
  it('always has at least two candidates, each with a note on how it connects', async () => {
    const { candidatesFor } = await import('../src/features/reporting/relatedCharts.js');
    const { OPERATIONAL_INSIGHTS } = await import('../src/features/reporting/operationalInsights.js');
    for (const id of Object.keys(OPERATIONAL_INSIGHTS)) {
      const m = getMetric(id);
      const c = candidatesFor(m, { metric: id, dimension: m.dimensions[0] });
      expect(c.length, id).toBeGreaterThanOrEqual(2);
      for (const r of c) {
        expect(r.why, `${id} → ${r.metric}`).toMatch(/\w{3,}.*\./);
        expect(`${r.metric}/${r.dimension}`).not.toBe(`${id}/${m.dimensions[0]}`);
      }
    }
  });

  it('a custom report gets the same count over time and another split', async () => {
    const { customCandidatesFor } = await import('../src/features/reporting/relatedCharts.js');
    const c = customCandidatesFor({ dataset: 'purchase_orders', groupBy: ['status'], measure: 'count', filters: {} });
    expect(c[0].custom.groupBy).toEqual(['month']);
    expect(c.length).toBeGreaterThanOrEqual(2);
  });
});
