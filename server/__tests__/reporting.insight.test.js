// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.insight.test.js
//
// The operational breakdown layer: which metrics it covers, that it
// cannot reach an impact metric, that every related chart it asks
// for is a legal spec, and that the arithmetic and the no-AI written
// reading hold up. No network and no database.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';

// The service imports the repositories, which open a pool at load.
vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));

const { METRICS, getMetric } = await import('../src/features/reporting/reportCatalog.js');
const { validateSpec } = await import('../src/features/reporting/specValidator.js');
const {
  OPERATIONAL_INSIGHTS, ACTION_LISTS, LENSES,
} = await import('../src/features/reporting/insights/operationalInsights.js');
const {
  previousRange, pctChange, toneFor, buildFigures, buildInsight,
} = await import('../src/services/reportingInsight.service.js');
const { fallbackNarrative, buildPayload } = await import('../src/features/reporting/insights/narrative.js');
const { buildTools } = await import('../src/features/reporting/ai/toolSchema.js');

const RANGE = { from: '2026-06-01', to: '2026-08-31' };
const operationalIds = Object.values(METRICS).filter((m) => !m.impactOnly).map((m) => m.id);
const impactIds = Object.values(METRICS).filter((m) => m.impactOnly).map((m) => m.id);

describe('insight config covers operations, never impact', () => {
  it('has an entry for every operational metric', () => {
    expect(Object.keys(OPERATIONAL_INSIGHTS).sort()).toEqual([...operationalIds].sort());
  });

  it('has no entry for, and no related chart pointing at, an impact metric', () => {
    for (const id of impactIds) expect(OPERATIONAL_INSIGHTS[id]).toBeUndefined();
    for (const cfg of Object.values(OPERATIONAL_INSIGHTS)) {
      for (const r of cfg.related) expect(getMetric(r.metric).impactOnly).toBeFalsy();
    }
  });

  it('refuses an impact metric before running anything', async () => {
    await expect(buildInsight({ spec: { metric: impactIds[0], dimension: 'none', dateRange: RANGE } }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('only names lists and lenses that exist', () => {
    for (const cfg of Object.values(OPERATIONAL_INSIGHTS)) {
      expect(LENSES[cfg.area]).toBeTruthy();
      for (const a of cfg.actions) expect(ACTION_LISTS[a]).toBeDefined();
    }
  });

  it('asks only for related charts the validator accepts', () => {
    for (const cfg of Object.values(OPERATIONAL_INSIGHTS)) {
      for (const r of cfg.related) {
        const m = getMetric(r.metric);
        expect(() => validateSpec({
          metric: r.metric, dimension: r.dimension, filters: {},
          dateRange: m.temporal === 'snapshot' ? undefined : RANGE,
        })).not.toThrow();
      }
    }
  });

  it('keeps donations, Section 18A, community requests and volunteers list-free', () => {
    for (const id of ['donation_value', 'section18a_pipeline', 'community_request_outcomes', 'volunteer_hours']) {
      expect(OPERATIONAL_INSIGHTS[id].actions).toEqual([]);
    }
  });
});

describe('previous period', () => {
  it('is the same length, ending the day before', () => {
    expect(previousRange({ from: '2026-06-01', to: '2026-06-30' })).toEqual({ from: '2026-05-02', to: '2026-05-31' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-01' })).toEqual({ from: '2026-02-28', to: '2026-02-28' });
  });

  it('withholds a change from zero rather than showing infinity', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
  });

  it('reads direction against what is good for the metric', () => {
    expect(toneFor(5, 'up')).toBe('good');
    expect(toneFor(5, 'down')).toBe('bad');
    expect(toneFor(-5, 'down')).toBe('good');
    expect(toneFor(5, null)).toBe('neutral');
    expect(toneFor(null, 'up')).toBe('neutral');
  });
});

const fakeReport = (metric, dimension, series, total) => ({
  spec: { metric, dimension, filters: {}, dateRange: RANGE },
  description: `${getMetric(metric).label}, ${RANGE.from} to ${RANGE.to}`,
  series, total, meta: { unit: getMetric(metric).unit },
});

describe('key figures', () => {
  it('leads with the total and its change, then the latest month', () => {
    const metric = getMetric('dispatch_volume');
    const report = fakeReport('dispatch_volume', 'month',
      [{ label: '2026-06', value: 100 }, { label: '2026-07', value: 120 }, { label: '2026-08', value: 150 }], 370);
    const { items } = buildFigures({
      metric, cfg: OPERATIONAL_INSIGHTS.dispatch_volume, report,
      previous: { dateRange: RANGE, total: 300, changePct: 23.3 }, actions: [],
    });
    expect(items[0]).toMatchObject({ value: 370, delta: 23.3, tone: 'good' });
    expect(items[1]).toMatchObject({ value: 150, delta: 50, tone: 'good' });
  });

  it('averages a unit price rather than summing it', () => {
    const metric = getMetric('unit_price_trend');
    const report = fakeReport('unit_price_trend', 'product',
      [{ label: 'Rice', value: 30 }, { label: 'Beans', value: 10 }], 40);
    const { items } = buildFigures({ metric, cfg: OPERATIONAL_INSIGHTS.unit_price_trend, report, previous: null, actions: [] });
    expect(items[0].value).toBe(20);
  });

  it('counts products for the reorder report, using the full list length', () => {
    const metric = getMetric('low_stock_items');
    const report = { ...fakeReport('low_stock_items', 'product', [{ label: 'Rice', value: -4 }], -4), spec: { metric: 'low_stock_items', dimension: 'product', filters: {} } };
    const { items } = buildFigures({
      metric, cfg: OPERATIONAL_INSIGHTS.low_stock_items, report, previous: null,
      actions: [{ id: 'low_stock', title: 'Products to reorder', total: 7, entries: [] }],
    });
    expect(items[0]).toMatchObject({ value: 7, unit: 'products', tone: 'bad' });
  });
});

describe('written reading without the AI', () => {
  const metric = getMetric('receiving_discrepancy_rate');
  const report = fakeReport('receiving_discrepancy_rate', 'supplier',
    [{ label: 'Supplier A', value: 20 }, { label: 'Supplier B', value: 5 }, { label: 'Supplier C', value: 2 }], 9);
  const actions = [{ id: 'open_discrepancies', title: 'Suppliers with unresolved delivery discrepancies', intro: 'Call them.', total: 2, entries: [{ name: 'Supplier A', contact: { phone: '021 000 0000' } }] }];
  const input = {
    metric, lens: LENSES.receiving, report,
    previous: { dateRange: previousRange(RANGE), total: 12, changePct: -25 },
    figures: buildFigures({ metric, cfg: OPERATIONAL_INSIGHTS.receiving_discrepancy_rate, report, previous: { changePct: -25 }, actions }),
    related: [], actions,
  };

  it('fills every section from the figures', () => {
    const n = fallbackNarrative(input);
    expect(n.source).toBe('template');
    expect(n.headline).toMatch(/down 25%/);
    expect(n.whatHappened).toBeTruthy();
    expect(n.meaning).toMatch(/below/);
    expect(n.nextSteps).toEqual(['Call them.']);
  });

  it('never hands the model the names or contacts on a list', () => {
    const payload = JSON.stringify(buildPayload(input));
    expect(payload).not.toContain('021 000 0000');
    expect(payload).toContain('"count":2');
  });

  it('says so plainly when the previous period was empty', () => {
    const n = fallbackNarrative({ ...input, previous: { dateRange: previousRange(RANGE), total: null, changePct: null, empty: true } });
    expect(n.whatHappened).toMatch(/no comparison/);
  });
});

describe('the ask box can say no without failing', () => {
  it('offers a no_matching_report function limited to operational metrics', () => {
    const noMatch = buildTools().find((t) => t.name === 'no_matching_report');
    expect(noMatch).toBeDefined();
    expect(noMatch.parameters.required).toEqual(['reason']);
    expect(noMatch.parameters.properties.closest_metric.enum.sort()).toEqual([...operationalIds].sort());
  });
});

describe('charts: comparisons, chart hints and two-way breakdowns', () => {
  it('lets the model name a declared comparison and nothing else', async () => {
    const { COMPARISON_IDS } = await import('../src/features/reporting/reportComparisons.js');
    const tool = buildTools().find((t) => t.name === 'run_comparison');
    expect(tool.parameters.properties.comparison.enum).toEqual(COMPARISON_IDS);
  });

  it('offers chart_type as a display hint only', () => {
    const run = buildTools().find((t) => t.name === 'run_report');
    expect(run.parameters.properties.chart_type.enum).toContain('donut');
    expect(run.parameters.required).toEqual(['metric']);
  });

  it('refuses an unknown comparison and a range that is too wide', async () => {
    const { runComparison } = await import('../src/services/reportingInsight.service.js');
    await expect(runComparison({ id: 'donors_vs_anything', dateRange: RANGE })).rejects.toMatchObject({ status: 400 });
    await expect(runComparison({ id: 'centre_collections_vs_children', dateRange: { from: '2020-01-01', to: '2026-01-01' } }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('keeps the two-way breakdowns on operational metrics only', () => {
    for (const d of ['month_beneficiary', 'month_supplier', 'month_movement']) {
      for (const m of Object.values(METRICS)) {
        if (m.dimensions.includes(d)) expect(m.impactOnly).toBeFalsy();
      }
    }
  });
});

describe('personal targets', () => {
  it('labels a limit or a target by which way is good', async () => {
    const { makeTarget } = await import('../src/services/reportingInsight.service.js');
    expect(makeTarget(getMetric('decanting_wastage'), OPERATIONAL_INSIGHTS.decanting_wastage, 3, true))
      .toMatchObject({ value: 3, label: 'Limit 3%', custom: true, defaultValue: 2 });
    expect(makeTarget(getMetric('collection_compliance'), OPERATIONAL_INSIGHTS.collection_compliance, 85, true).label)
      .toBe('Target 85%');
    expect(makeTarget(getMetric('dispatch_volume'), OPERATIONAL_INSIGHTS.dispatch_volume, undefined, false)).toBeNull();
  });

  it('refuses a target on an impact metric, a negative number, or a percentage over 100', async () => {
    const { setTarget } = await import('../src/services/reportingInsight.service.js');
    await expect(setTarget({ userId: 1, metricId: impactIds[0], value: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(setTarget({ userId: 1, metricId: 'collection_compliance', value: -1 })).rejects.toMatchObject({ status: 400 });
    await expect(setTarget({ userId: 1, metricId: 'collection_compliance', value: 101 })).rejects.toMatchObject({ status: 400 });
  });
});

describe('second-wave catalog', () => {
  const NEW = ['po_on_time_rate', 'supplier_lead_time', 'overdue_purchase_orders', 'purchase_order_pipeline',
    'picking_turnaround', 'slip_pipeline', 'gate_load_variance', 'late_collection_rate', 'standing_order_demand',
    'stock_value', 'expiring_stock', 'adjustment_reasons', 'decanting_margin_rate', 'community_response_time',
    'donation_routing', 'volunteer_event_attendance'];

  it('adds every new metric as operational, reachable by the model', () => {
    const ids = buildTools().find((t) => t.name === 'run_report').parameters.properties.metric.enum;
    for (const id of NEW) {
      expect(METRICS[id], id).toBeDefined();
      expect(METRICS[id].impactOnly).toBeFalsy();
      expect(ids).toContain(id);
    }
  });

  it('validates every new metric with each of its breakdowns', () => {
    for (const id of NEW) {
      const m = METRICS[id];
      for (const d of m.dimensions) {
        expect(() => validateSpec({ metric: id, dimension: d, filters: {}, dateRange: m.temporal === 'snapshot' ? undefined : RANGE }), `${id}/${d}`).not.toThrow();
      }
    }
  });
});
