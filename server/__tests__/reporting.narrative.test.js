// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.narrative.test.js
//
// The written report's two opening sections when they are built from
// the figures (no model): "About this chart" must explain what one
// bar is, the total, highest and lowest and the target line; the
// "Business view" must say whether the operation is meeting its
// target and which way it is moving — without inventing anything.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { explainChart, businessRead, fallbackNarrative } from '../src/features/reporting/narrative.js';

const metric = { label: 'Collection compliance', unit: '%', description: 'The share of pallets collected.' };
const report = {
  spec: { dimension: 'month', dateRange: { from: '2026-07-01', to: '2026-09-27' } },
  total: 18.8,
  series: [{ label: '2026-08', value: 37.5 }, { label: '2026-09', value: 0 }],
};
const target = { value: 90, better: 'up', label: 'Target 90%' };

describe('About this chart', () => {
  it('says what a bar is, the highest and lowest, and where the target sits', () => {
    const text = explainChart({ metric, report, target });
    expect(text).toMatch(/from 2026-07-01 to 2026-09-27/);
    expect(text).toMatch(/Each bar or point is one month/);
    expect(text).toMatch(/highest is August 2026 at 37.5%/);
    expect(text).toMatch(/lowest is September 2026 at 0%/);
    expect(text).toMatch(/working target of 90%: 0 of 2 are on the right side/);
    expect(text).toMatch(/early signal/);   // only two records
  });

  it('does not add up percentages into a total', () => {
    expect(explainChart({ metric, report, target })).not.toMatch(/come to/);
  });

  it('says so plainly when nothing was recorded', () => {
    const text = explainChart({ metric, report: { ...report, series: [], total: 0 } });
    expect(text).toMatch(/Nothing was recorded/);
  });
});

describe('Business view', () => {
  const figures = { better: 'up', items: [{ label: 'Compliance', value: 18.8, unit: '%' }] };
  const lens = 'Food that is packed but not collected is a centre that went without. Read the figures for how often.';

  it('keeps the requirement, drops the instruction written for the model', () => {
    const text = businessRead({ metric, lens, report, figures, actions: [], target });
    expect(text).toMatch(/a centre that went without/);
    expect(text).not.toMatch(/Read the figures/);
  });

  it('says whether the latest figure meets the target', () => {
    expect(businessRead({ metric, lens, report, figures, actions: [], target })).toMatch(/outside its working target of 90%/);
  });

  it('says which way it is moving, judged by which direction is good', () => {
    const worse = businessRead({ metric, lens, report, figures, actions: [], previous: { changePct: -12 } });
    expect(worse).toMatch(/wrong way, 12% down/);
  });

  it('points at the Actions when there are people to follow up', () => {
    const actions = [{ title: 'Centres that missed collections', total: 3 }];
    expect(businessRead({ metric, lens, report, figures, actions, target })).toMatch(/Actions below list who to follow up with first: centres that missed collections/);
  });
});

describe('the whole fallback', () => {
  it('always has both new sections', () => {
    const n = fallbackNarrative({
      metric, lens: 'x', report, previous: null, related: [], actions: [], target,
      figures: { better: 'up', items: [{ label: 'Compliance', value: 18.8, unit: '%' }] },
    });
    expect(n.explanation).toBeTruthy();
    expect(n.businessView).toBeTruthy();
  });
});

// ── Scatter comparisons ────────────────────────────────────────
import { attentionPoints } from '../src/services/reportingInsight.service.js';
import { getComparison } from '../src/features/reporting/reportComparisons.js';
import { fallbackComparisonNarrative } from '../src/features/reporting/narrative.js';

describe('which dots a comparison report flags', () => {
  it('flags packers above the average flag rate, worst first', () => {
    const def = getComparison('packer_workload_vs_flags');
    const pts = [
      { label: 'A', x: 7, y: 0, meta: {} },
      { label: 'B', x: 42, y: 7.1, meta: {} },
      { label: 'C', x: 49, y: 0, meta: {} },
    ];
    const avg = { x: 32.7, y: 2.37 };
    expect(attentionPoints(def, pts, avg).map((p) => p.label)).toEqual(['B']);
  });

  it('flags larger centres that missed collections, most missed first', () => {
    const def = getComparison('centre_collections_vs_children');
    const pts = [
      { label: 'Big, missed 3', x: 75, y: 1, meta: { missed: 3 } },
      { label: 'Big, none missed', x: 55, y: 2, meta: { missed: 0 } },
      { label: 'Big, missed 1', x: 68, y: 1, meta: { missed: 1 } },
      { label: 'Small, missed 2', x: 30, y: 0, meta: { missed: 2 } },
    ];
    expect(attentionPoints(def, pts, { x: 52, y: 1 }).map((p) => p.label)).toEqual(['Big, missed 3', 'Big, missed 1']);
  });

  it('gives every comparison a lens, an action heading and a name for one dot', () => {
    for (const id of ['centre_collections_vs_children', 'supplier_volume_vs_discrepancy', 'product_price_vs_quantity', 'packer_workload_vs_flags']) {
      const def = getComparison(id);
      expect(def.lens, id).toBeTruthy();
      expect(def.actionTitle, id).toBeTruthy();
      expect(def.unitLabel, id).toBeTruthy();
    }
  });
});

describe('a comparison report written from the figures', () => {
  const def = getComparison('packer_workload_vs_flags');
  const comparison = {
    dateRange: { from: '2026-07-01', to: '2026-09-27' },
    averages: { x: 32.7, y: 2.37 },
    points: [{ label: 'Mcebisi', x: 42, y: 7.1 }, { label: 'Nomsa', x: 49, y: 0 }],
  };

  it('explains dots, axes and the average lines', () => {
    const n = fallbackComparisonNarrative({ def, comparison, flagged: [comparison.points[0]] });
    expect(n.explanation).toMatch(/Each dot is one staff packer/);
    expect(n.explanation).toMatch(/dashed lines are the averages/);
    expect(n.explanation).toMatch(/highest is Mcebisi at 7.1%/);
    expect(n.headline).toMatch(/1 of 2 needs attention/);
    expect(n.businessView).toMatch(/packed complete and on time/);
  });

  it('says so when the period is empty', () => {
    const n = fallbackComparisonNarrative({ def, comparison: { ...comparison, points: [] }, flagged: [] });
    expect(n.explanation).toMatch(/Nothing was recorded/);
  });
});
