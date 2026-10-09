// ─────────────────────────────────────────────────────────────
// client/src/tests/ChartDiagrams.test.jsx
//
// The arithmetic behind the Operations page's diagrams: the funnel
// (reached = at a stage or past it), the waterfall (each change floats
// from the last level), the flow's nodes and links, anomaly markers,
// last year's dates and the red/amber/green bands — and that each
// diagram is offered only for a report that asks for it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  anomaliesOf, defaultView, flowOf, funnelOf, ragColour, viewsFor, waterfallOf, yearEarlier,
} from '../features/reporting/chartFormat';
import { Funnel } from '../features/reporting/OperationalDiagrams';

const PO_FUNNEL = { stages: ['pending', 'approved', 'in_transit', 'completed'], exits: ['returned'] };
const PO_SERIES = [
  { label: 'completed', value: 28 }, { label: 'approved', value: 7 }, { label: 'pending', value: 7 },
  { label: 'in_transit', value: 6 }, { label: 'returned', value: 4 }, { label: 'mystery', value: 1 },
];

describe('funnel', () => {
  it('counts everything at a stage or past it as having reached it', () => {
    const { stages } = funnelOf(PO_SERIES, PO_FUNNEL);
    expect(stages.map((s) => s.reached)).toEqual([48, 41, 34, 28]);
    expect(stages.map((s) => s.here)).toEqual([7, 7, 6, 28]);
    expect(stages[3].ofStart).toBe(58);
    expect(stages[1].fromPrev).toBe(85);
  });

  it('lists exits, and never drops a status it does not know', () => {
    const { exits } = funnelOf(PO_SERIES, PO_FUNNEL);
    expect(exits).toEqual([{ id: 'returned', value: 4 }, { id: 'mystery', value: 1 }]);
  });

  it('prints its numbers, not only bar widths', () => {
    render(<Funnel series={PO_SERIES} funnel={PO_FUNNEL} unit="orders" onPick={() => {}} />);
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText(/58% of the start/)).toBeInTheDocument();
    expect(screen.getByText(/Left the pipeline/)).toBeInTheDocument();
  });
});

describe('waterfall', () => {
  it('floats each change from where the last one ended', () => {
    const rows = waterfallOf([
      { label: 'Opening stock', value: 100, meta: { kind: 'total' } },
      { label: 'Received', value: 50 },
      { label: 'Dispatched', value: -30 },
      { label: 'Closing stock', value: 120, meta: { kind: 'total' } },
    ]);
    expect(rows.map((r) => [r.base, r.value])).toEqual([[0, 100], [100, 50], [120, 30], [0, 120]]);
    expect(rows[2].signed).toBe(-30);
  });
});

describe('flow', () => {
  it('keeps the two sides apart and drops empty links', () => {
    const { nodes, links } = flowOf([
      { label: 'recipe_food|pending', value: 3 }, { label: 'non_food|pending', value: 1 },
      { label: 'pending|allocated', value: 2 }, { label: 'x|y', value: 0 },
    ]);
    // "pending" is both a source and a target: two nodes, not one.
    expect(nodes.filter((n) => n.name === 'Pending')).toHaveLength(2);
    expect(links).toHaveLength(3);
  });
});

describe('anomaly markers', () => {
  const months = (vals) => vals.map((v, i) => ({ name: `2026-0${i + 1}`, value: v }));

  it('flags a spike that is far from the usual level', () => {
    const a = anomaliesOf(months([100, 104, 98, 101, 400, 99, 102]));
    expect(a).toEqual([expect.objectContaining({ name: '2026-05', direction: 'high' })]);
  });

  it('says nothing about ordinary ups and downs, or too few points', () => {
    expect(anomaliesOf(months([100, 120, 90, 110, 95, 105]))).toEqual([]);
    expect(anomaliesOf(months([1, 500]))).toEqual([]);
  });
});

describe('last year and RAG bands', () => {
  it('moves both dates back a year, 29 February to the 28th', () => {
    expect(yearEarlier({ from: '2028-02-29', to: '2028-09-30' })).toEqual({ from: '2027-02-28', to: '2027-09-30' });
  });

  it('colours days of cover red, amber, green', () => {
    const rag = { red: 14, amber: 30 };
    expect(ragColour(rag, 5)).toBe('var(--rag-bad)');
    expect(ragColour(rag, 20)).toBe('var(--rag-warn)');
    expect(ragColour(rag, 90)).toBe('var(--rag-good)');
    expect(ragColour(null, 5)).toBeNull();
  });
});

describe('which diagram a report opens on', () => {
  it('opens a pipeline on its funnel, and plain reports as before', () => {
    const views = viewsFor('category', 'orders', PO_SERIES, { funnel: PO_FUNNEL });
    expect(views[0]).toBe('funnel');
    expect(defaultView(views, 'bar', undefined, { funnel: PO_FUNNEL })).toBe('funnel');
    expect(viewsFor('category', 'orders', PO_SERIES)).not.toContain('funnel');
  });

  it('opens a stock flow as a waterfall, donation routing as a flow, and a week × day as a heatmap', () => {
    expect(viewsFor('category', 'kg', [], { waterfall: true })).toEqual(['waterfall', 'table']);
    expect(viewsFor('twoAxis', 'items', [], { flows: true })).toEqual(['sankey', 'table']);
    const twoWay = viewsFor('twoAxis', 'units', []);
    expect(defaultView(twoWay, 'bar', undefined, { preferView: 'heatmap' })).toBe('heatmap');
  });
});

describe('week × day heatmap', () => {
  it('keeps Monday to Sunday, all seven, whatever the totals', async () => {
    const { pivot } = await import('../features/reporting/chartFormat');
    const { keys } = pivot([{ label: '2026-W33|Wed', value: 900 }, { label: '2026-W33|Mon', value: 5 }]);
    expect(keys).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});
