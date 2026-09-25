// ─────────────────────────────────────────────────────────────
// src/tests/OperationalChart.test.jsx
//
// The Operations page charts: every data shape offers the right
// views, each view renders, and highlighting is visible without
// colour (a named chip, a bold table row). jsdom has no layout, so
// ResponsiveContainer is given a fixed size here.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { cloneElement } from 'react';

vi.mock('recharts', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 300 }),
  };
});

import OperationalChart from '../features/reporting/components/OperationalChart';
import ComparisonChart from '../features/reporting/components/ComparisonChart';
import ComboChart from '../features/reporting/components/ComboChart';
import { pivot, shapeOf, viewsFor } from '../features/reporting/chartFormat';

const category = {
  spec: { metric: 'repeat_non_collections', dimension: 'ecd_centre' },
  chartType: 'hbar',
  meta: { unit: 'missed collections' },
  series: [
    { label: 'Ikhaya', value: 3 }, { label: 'Bright Beginnings', value: 2 },
    { label: 'Little Stars', value: 1 }, { label: 'Sunrise', value: 1 },
  ],
};
const time = {
  spec: { metric: 'collection_compliance', dimension: 'month' },
  chartType: 'bar',
  meta: { unit: '%' },
  series: [{ label: '2026-07', value: 80 }, { label: '2026-08', value: 92 }],
};
const twoAxis = {
  spec: { metric: 'procurement_spend', dimension: 'month_supplier' },
  chartType: 'line',
  meta: { unit: 'ZAR' },
  series: [
    { label: '2026-07|Bokomo', value: 100 }, { label: '2026-07|Cape Cold', value: 50 },
    { label: '2026-08|Bokomo', value: 120 },
  ],
};

describe('chart shapes', () => {
  it('detects each shape and offers views that suit it', () => {
    expect(shapeOf(category)).toBe('category');
    expect(viewsFor('category', 'missed collections', category.series)).toEqual(['hbar', 'bar', 'donut', 'pareto', 'table']);
    expect(shapeOf(time)).toBe('time');
    // A percentage is never shown as shares of a whole.
    expect(viewsFor('category', '%', time.series)).not.toContain('donut');
    expect(shapeOf(twoAxis)).toBe('twoAxis');
  });

  it('folds categories past seven into Other, keeping the biggest', () => {
    const series = Array.from({ length: 10 }, (_, i) => ({ label: `2026-08|S${i}`, value: 10 - i }));
    const { keys, rows } = pivot(series);
    expect(keys).toHaveLength(8);
    expect(keys[7]).toBe('Other');
    expect(rows[0].Other).toBe(3 + 2 + 1);
  });
});

describe('OperationalChart', () => {
  it('renders every view a category report offers', () => {
    render(<OperationalChart report={category} dimensionLabel="ECD centre" />);
    for (const name of ['Columns', 'Donut', 'Pareto', 'Table', 'Bars']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('highlights an item from the table, named in a chip, and clears it', () => {
    const onHighlight = vi.fn();
    const { rerender } = render(<OperationalChart report={category} dimensionLabel="ECD centre" highlight={null} onHighlight={onHighlight} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByText('Ikhaya'));
    expect(onHighlight).toHaveBeenCalledWith('Ikhaya');

    rerender(<OperationalChart report={category} dimensionLabel="ECD centre" highlight="Ikhaya" onHighlight={onHighlight} />);
    expect(screen.getByText(/Highlighting: Ikhaya/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear highlight' }));
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it('opens on the view the AI was asked for', () => {
    render(<OperationalChart report={category} hint="donut" />);
    expect(screen.getByRole('button', { name: 'Donut' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a hint the data cannot take', () => {
    render(<OperationalChart report={time} hint="donut" />);
    expect(screen.getByRole('button', { name: 'Columns' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers the working target line when one is given', () => {
    render(<OperationalChart report={time} target={{ value: 90, label: 'Target 90%' }} />);
    expect(screen.getByLabelText('Target 90%')).toBeChecked();
  });

  it('draws two-way data as stacked, grouped or a heatmap', () => {
    render(<OperationalChart report={twoAxis} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heatmap' }));
    expect(screen.getByRole('rowheader', { name: 'Bokomo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grouped' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stacked' }));
  });
});

describe('ComparisonChart and ComboChart', () => {
  const comparison = {
    id: 'centre_collections_vs_children',
    x: { label: 'Registered children', unit: 'children' },
    y: { label: 'Pallets collected', unit: 'collections' },
    points: [
      { label: 'Ikhaya', x: 60, y: 1, detail: '3 missed' },
      { label: 'Sunrise', x: 20, y: 4, detail: '0 missed' },
    ],
  };

  it('renders a scatter plot and its table, with highlight', () => {
    render(<ComparisonChart data={comparison} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show table' }));
    fireEvent.click(screen.getByText('Ikhaya'));
    expect(screen.getByText(/Highlighting: Ikhaya/)).toBeInTheDocument();
  });

  it('renders two measures as two charts on one month axis', () => {
    render(<ComboChart combo={{
      title: 'Spend and unit price',
      bars: { label: 'Procurement spend', unit: 'ZAR', series: [{ label: '2026-07', value: 10 }, { label: '2026-08', value: 12 }] },
      line: { label: 'Unit price trend', unit: 'ZAR/unit', series: [{ label: '2026-07', value: 5 }, { label: '2026-08', value: 6 }] },
    }} />);
    expect(screen.getByText('Procurement spend')).toBeInTheDocument();
    expect(screen.getByText('Unit price trend')).toBeInTheDocument();
  });
});
