// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.drill.test.js
//
// Drill-down plans: a bar for a thing becomes the same report over
// time filtered to it; a month becomes its weeks; and nothing is
// offered that would not run (snapshots, filters the report lacks).
// Also: the new diagram reports are wired to their diagrams.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { canDrill, planDrill } from '../src/features/reporting/drillDown.js';
import { getMetric, METRICS, DIMENSIONS } from '../src/features/reporting/reportCatalog.js';

const RANGE = { from: '2026-06-01', to: '2026-09-27' };

describe('what can be drilled', () => {
  it('offers a drill only where the report can filter to the bar and show it over time', () => {
    expect(canDrill(getMetric('receiving_discrepancy_rate'), 'supplier')).toBe(true);
    expect(canDrill(getMetric('dispatch_volume'), 'month')).toBe(true);
    expect(canDrill(getMetric('stock_on_hand'), 'supplier')).toBe(false);   // a snapshot has no "over time"
    expect(canDrill(getMetric('dispatch_volume'), 'weekday')).toBe(false);
  });

  it('every drill it offers names a filter and a breakdown the report really has', () => {
    for (const m of Object.values(METRICS)) {
      for (const dim of m.dimensions) {
        if (!canDrill(m, dim)) continue;
        const plan = planDrill(m, { metric: m.id, dimension: dim, filters: {}, dateRange: RANGE }, dim === 'month' ? '2026-07' : 'X');
        expect(plan, `${m.id}/${dim}`).toBeTruthy();
        expect(m.dimensions, `${m.id}/${dim}`).toContain(plan.spec.dimension);
        if (plan.filter) expect(m.filters).toContain(plan.filter);
      }
    }
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
      { metric: 'dispatch_volume', dimension: 'cohort', filters: { beneficiary_kind: 'ecd' }, dateRange: RANGE }, 'week1');
    expect(plan.lookup).toBeUndefined();
    expect(plan.spec.filters).toEqual({ beneficiary_kind: 'ecd', cohort: 'week1' });
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
    const { candidatesFor } = await import('../src/features/reporting/insights/relatedCharts.js');
    const { OPERATIONAL_INSIGHTS } = await import('../src/features/reporting/insights/operationalInsights.js');
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
    const { customCandidatesFor } = await import('../src/features/reporting/insights/relatedCharts.js');
    const c = customCandidatesFor({ dataset: 'purchase_orders', groupBy: ['status'], measure: 'count', filters: {} });
    expect(c[0].custom.groupBy).toEqual(['month']);
    expect(c.length).toBeGreaterThanOrEqual(2);
  });
});
