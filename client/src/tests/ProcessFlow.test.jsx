// ─────────────────────────────────────────────────────────────
// src/tests/ProcessFlow.test.jsx
//
// The flow map. First the arithmetic (flowGraph.js): routes, the
// connections between steps, repeats, and narrowing the cases. Then the
// screen: it must open on the common routes, let a step or connection
// be chosen, and redraw when the cases are narrowed.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  START, END, variantsOf, applyFilters, graphOf, neighbours, layoutOf, edgePath, routesToCover, filterLabel, thickness,
} from '../features/reporting/flowGraph';

vi.mock('../lib/excelExport', () => ({ exportExcel: vi.fn() }));
const { default: ProcessFlow } = await import('../features/reporting/ProcessFlow');

// 0 Slip raised · 1 Claimed · 2 Lines packed · 3 Line flagged · 4 Packed · 5 Collected · 6 Not collected
const ACTIVITIES = ['Slip raised', 'Claimed', 'Lines packed', 'Line flagged', 'Packed', 'Collected', 'Not collected'].map((label, id) => ({ id: String(id), label }));
const c = (id, path, t) => ({ id, label: `Centre ${id}`, path, t: t ?? path.map((_, i) => i) });
const PALLETS = {
  id: 'pallets', label: 'Pallets', caseNoun: 'pallets', activities: ACTIVITIES, expected: [0, 1, 2, 4, 5], total: 10, truncated: false,
  cases: [
    ...[1, 2, 3, 4, 5, 6].map((id) => c(id, [0, 1, 2, 4, 5], [0, 1, 2, 4, 30 + id])),
    c(7, [0, 1, 2, 3, 1, 2, 4, 5]),
    c(8, [0, 1, 2, 3, 1, 2, 4, 5]),
    c(9, [0, 1, 2, 4, 6]),
    c(10, [0, 4, 5], [0, null, 9]),
  ],
};
const ORDERS = { id: 'orders', label: 'Purchase orders', caseNoun: 'purchase orders', activities: [{ id: 'raised', label: 'Order raised' }], expected: [0], cases: [], total: 0, truncated: false };
const FLOW = { processes: [ORDERS, PALLETS] };
const RANGE = { from: '2026-08-01', to: '2026-10-12' };

describe('routes', () => {
  it('groups cases by the path they took, commonest first', () => {
    const v = variantsOf(PALLETS);
    expect(v.map((x) => [x.cases.length, x.share])).toEqual([[6, 60], [2, 20], [1, 10], [1, 10]]);
    expect(v[0]).toMatchObject({ expected: true, repeats: false });
    expect(v[1]).toMatchObject({ expected: false, repeats: true });
  });

  it('gives a route its typical time from first step to last', () => {
    expect(variantsOf(PALLETS)[0].medianHours).toBe(33.5);
  });

  it('covers most cases with the fewest routes', () => {
    expect(routesToCover(variantsOf(PALLETS))).toBe(2);
    expect(routesToCover(variantsOf(PALLETS), 100)).toBe(4);
  });
});

describe('narrowing the cases', () => {
  it('keeps cases that pass through a step, or skip it', () => {
    expect(applyFilters(PALLETS.cases, [{ kind: 'through', step: 3 }]).map((x) => x.id)).toEqual([7, 8]);
    expect(applyFilters(PALLETS.cases, [{ kind: 'avoid', step: 1 }]).map((x) => x.id)).toEqual([10]);
  });

  it('keeps cases that took a connection, or never did, the two ends included', () => {
    expect(applyFilters(PALLETS.cases, [{ kind: 'with', from: 3, to: 1 }])).toHaveLength(2);
    expect(applyFilters(PALLETS.cases, [{ kind: 'with', from: 6, to: END }]).map((x) => x.id)).toEqual([9]);
    expect(applyFilters(PALLETS.cases, [{ kind: 'without', from: START, to: 0 }])).toHaveLength(0);
    expect(applyFilters(PALLETS.cases, [{ kind: 'through', step: 4 }, { kind: 'avoid', step: 5 }]).map((x) => x.id)).toEqual([9]);
  });

  it('says a filter in words', () => {
    expect(filterLabel(PALLETS, { kind: 'avoid', step: 1 })).toBe('Bypasses: Claimed');
    expect(filterLabel(PALLETS, { kind: 'with', from: 3, to: 1 })).toBe('Transition: Line flagged to Claimed');
  });
});

describe('the graph', () => {
  const graph = graphOf(PALLETS, PALLETS.cases);
  const edge = (from, to) => graph.edges.find((e) => e.from === from && e.to === to);
  const node = (id) => graph.nodes.find((n) => n.id === id);

  it('counts a step once per case, and separately how often it happened', () => {
    expect(node(1)).toMatchObject({ cases: 9, count: 11, repeated: 2 });
    expect(node(3)).toMatchObject({ cases: 2, expected: false });
  });

  it('counts each connection, and marks the ones off the expected route', () => {
    expect(edge(START, 0).count).toBe(10);
    expect(edge(2, 4)).toMatchObject({ count: 9, expected: true, back: false });
    expect(edge(0, 4)).toMatchObject({ count: 1, expected: false });
    expect(edge(5, END)).toMatchObject({ count: 9, expected: true });
    expect(edge(6, END)).toMatchObject({ count: 1, expected: false });
  });

  it('marks a connection that goes back to an earlier step', () => {
    expect(edge(3, 1)).toMatchObject({ count: 2, back: true, expected: false });
  });

  it('times a connection only from steps whose times were recorded', () => {
    expect(edge(4, 5).medianHours).toBe(28.5);
    expect(edge(0, 4)).toMatchObject({ measured: 0, medianHours: null });
  });

  it('says what a step leads to', () => {
    expect(neighbours(graph, PALLETS, 4, 'next')).toEqual([
      { id: 5, label: 'Collected', count: 9, share: 90 },
      { id: 6, label: 'Not collected', count: 1, share: 10 },
    ]);
    expect(neighbours(graph, PALLETS, 0, 'before')[0]).toMatchObject({ label: 'Process start', count: 10 });
  });

  it('lays the steps out top to bottom, the common route in one column', () => {
    const layout = layoutOf(graph, [0, 1, 2, 4, 5]);
    const rows = [0, 1, 2, 4, 5].map((id) => layout.at.get(id));
    expect(rows.every((p) => p.column === 0)).toBe(true);
    expect(rows.map((p) => p.y)).toEqual([...rows.map((p) => p.y)].sort((a, b) => a - b));
    expect(layout.at.get(3).column).toBe(1);
    expect(layout.at.get(START).y).toBeLessThan(layout.at.get(0).y);
    expect(layout.at.get(END).y).toBeGreaterThan(layout.at.get(5).y);
    expect(edgePath(layout, 2, 4).d).toMatch(/^M [\d.]+ [\d.]+ C /);
    expect(edgePath(layout, 2, 99)).toBeNull();
  });

  it('draws a busier connection thicker', () => {
    expect(thickness(9, 10)).toBeGreaterThan(thickness(1, 10));
    expect(thickness(null, 10)).toBe(1.5);
  });
});

describe('the flow map on screen', () => {
  const show = () => render(<ProcessFlow flow={FLOW} range={RANGE} />);
  const step = (name) => screen.getByRole('button', { name: new RegExp(`^${name}: `) });

  it('opens on the process that has cases, with its common routes', () => {
    show();
    expect(screen.getByLabelText('Process')).toHaveValue('pallets');
    expect(screen.getByText('2 of 4 shown · 80% of pallets')).toBeInTheDocument();
    expect(step('Line flagged')).toBeInTheDocument();
    // The rare routes are not on the map until asked for.
    expect(screen.queryByRole('button', { name: /^Not collected: / })).not.toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('shows every route when the slider is pulled across', async () => {
    show();
    const slider = screen.getByRole('slider', { name: 'Number of variants shown' });
    fireEvent.change(slider, { target: { value: '4' } });
    expect(screen.getByText('4 of 4 shown · 100% of pallets')).toBeInTheDocument();
    expect(step('Not collected')).toBeInTheDocument();
  });

  it('switches a route on and off by itself, and shows one alone with its cases', async () => {
    show();
    await userEvent.click(screen.getByRole('checkbox', { name: /^Show variant 3: / }));
    expect(step('Not collected')).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('region', { name: 'Variants' })).getAllByRole('button', { name: 'Isolate' })[1]);
    expect(screen.getByText('1 of 4 shown · 20% of pallets')).toBeInTheDocument();
    const detail = screen.getByRole('region', { name: 'Variant: details' });
    expect(within(detail).getByText('Centre 7')).toBeInTheDocument();
  });

  it('opens a step: what came before and next, and how often it repeated', async () => {
    show();
    await userEvent.click(step('Claimed'));
    const detail = screen.getByRole('region', { name: 'Claimed: details' });
    expect(detail).toHaveTextContent('Present in 8 of 8 pallets in view. Repeated in 2 (rework).');
    expect(within(detail).getByRole('button', { name: 'Line flagged' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Lines packed' })).toBeInTheDocument();
  });

  it('keeps only the cases through a step, and puts them back when the filter is removed', async () => {
    show();
    await userEvent.click(step('Line flagged'));
    await userEvent.click(screen.getByRole('button', { name: 'Filter: cases through this activity' }));
    expect(screen.getByText('1 of 1 shown · 100% of pallets')).toBeInTheDocument();
    expect(screen.getByText('Case filters:')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Through: Line flagged/ }));
    expect(screen.getByText('2 of 4 shown · 80% of pallets')).toBeInTheDocument();
  });

  it('opens a connection: its times and the slowest cases on it', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /^Packed to Collected: 8 pallets/ }));
    const detail = screen.getByRole('region', { name: 'Packed to Collected: details' });
    expect(within(detail).getByText('Longest durations')).toBeInTheDocument();
    expect(within(detail).getByText('Centre 6')).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Filter: cases without this transition' }));
    expect(screen.getByText('No transition: Packed to Collected', { exact: false })).toBeInTheDocument();
  });

  it('says a connection that goes back is work done again', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /^Line flagged to Claimed: / }));
    expect(screen.getByRole('region', { name: 'Line flagged to Claimed: details' })).toHaveTextContent('Rework loop: returns to an earlier activity.');
  });

  it('switches to how long, and to the other process', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Duration' }));
    expect(screen.getByText(/Thicker: longer duration/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Process'), 'orders');
    expect(screen.getByText('No purchase orders in this period.')).toBeInTheDocument();
  });

  it('uses no em dashes in what people read', async () => {
    show();
    await userEvent.click(step('Claimed'));
    expect(document.body.textContent).not.toMatch(/—/);
  });
});

// Each step's circle shows the icon for that activity. The map's nodes
// are numbered by position, so the icon has to be looked up by the
// activity's own id, not the node's: it once drew every step as the
// fallback plain circle.
describe('step icons', () => {
  const REAL = {
    id: 'pallets', label: 'Pallets', caseNoun: 'pallets', total: 2, truncated: false,
    activities: [
      { id: 'generated', label: 'Slip generated' }, { id: 'claimed', label: 'Assigned' },
      { id: 'packed', label: 'Packing complete' }, { id: 'collected', label: 'Dispatched' },
    ],
    expected: [0, 1, 2, 3],
    cases: [c(1, [0, 1, 2, 3]), c(2, [0, 1, 2, 3])],
  };

  it('draws the icon of each activity, not a plain circle', () => {
    render(<ProcessFlow flow={{ processes: [REAL] }} range={RANGE} />);
    const iconOf = (name) => screen.getByRole('button', { name: new RegExp(`^${name}: `) }).querySelector('svg.lucide');
    expect(iconOf('Slip generated')).toHaveClass('lucide-file-text');
    expect(iconOf('Assigned')).toHaveClass('lucide-user-check');
    expect(iconOf('Packing complete')).toHaveClass('lucide-package-check');
    expect(iconOf('Dispatched')).toHaveClass('lucide-truck');
  });
});
