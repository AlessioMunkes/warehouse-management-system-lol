// ─────────────────────────────────────────────────────────────
// src/tests/ChartTooltip.test.jsx
//
// Every chart's hover tip reads the same way: what was pointed at,
// then the figure with its unit, then the series name when there is
// more than one, then quiet extras and the report's note. And no chart
// file keeps a tip, a colour list or a tooltip of its own.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import ChartTooltip, { ChartTip } from '../features/reporting/ChartTooltip';
import { entityColours, SERIES, OTHER_COLOUR } from '../features/reporting/chartFormat';

const payload = (value, extra = {}) => [{ value, name: 'value', color: 'var(--viz-1)', payload: { name: 'Langa', ...extra } }];

describe('the shared chart tip', () => {
  it('leads with the figure and its unit, under the name of what was pointed at', () => {
    render(<ChartTooltip active payload={payload(30)} label="Langa" unit="kg" />);
    const tip = screen.getByTestId('chart-tip');
    expect(tip).toHaveTextContent('Langa');
    expect(tip).toHaveTextContent('30 kg');
  });

  it('adds a share of the total only when given one', () => {
    const { rerender } = render(<ChartTooltip active payload={payload(30)} label="Langa" unit="kg" total={100} />);
    expect(screen.getByTestId('chart-tip')).toHaveTextContent('30% of the total');
    rerender(<ChartTooltip active payload={payload(30)} label="Langa" unit="kg" />);
    expect(screen.getByTestId('chart-tip')).not.toHaveTextContent('of the total');
  });

  it('names each series when there is more than one', () => {
    render(<ChartTooltip active label="2026-09" unit="kg" payload={[
      { value: 3, name: 'soup_kitchen', color: 'var(--viz-1)', payload: {} },
      { value: 5, name: 'ecd', color: 'var(--viz-2)', payload: {} },
    ]} />);
    const tip = screen.getByTestId('chart-tip');
    expect(tip).toHaveTextContent('Soup kitchen');
    expect(tip).toHaveTextContent('5 kg');
  });

  it('puts the note under the figures, one line per point', () => {
    render(<ChartTip title="Langa" rows={[{ value: '30 kg' }]} notes={['Counts every weigh-in.']} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('Counts every weigh-in.');
  });

  it('shows nothing when the pointer is not on a mark', () => {
    const { container } = render(<ChartTooltip active={false} payload={payload(1)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('category colours', () => {
  it('follow the category, not its place, and go grey past eight', () => {
    const series = Array.from({ length: 10 }, (_, i) => ({ label: `C${i}`, value: 10 - i }));
    const colourOf = entityColours(series);
    expect(colourOf('C0')).toBe(SERIES[0]);
    expect(colourOf('C7')).toBe(SERIES[7]);
    expect(colourOf('C9')).toBe(OTHER_COLOUR);
    // A sorted or filtered list asks by name, so a survivor keeps its colour.
    expect(entityColours([...series].reverse())('C0')).toBe(OTHER_COLOUR);
    expect(colourOf('C3')).toBe(SERIES[3]);
  });
});

// Every file that draws a chart, kept on the shared tip and palette.
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

describe('chart files', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const charts = walk(join(root, 'features')).filter((f) => /\.jsx$/.test(f))
    .filter((f) => readFileSync(f, 'utf8').includes("from 'recharts'"));

  it('find the charts', () => {
    expect(charts.length).toBeGreaterThan(4);
  });

  it.each(charts.map((f) => [f.slice(root.length + 1)]))('%s uses the shared tip, not its own', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8');
    // A bare <Tooltip /> draws Recharts' own unstyled box.
    expect(src).not.toMatch(/<Tooltip\s*\/>/);
    expect(src).not.toMatch(/function Tip\(/);
    if (/<Tooltip/.test(src)) expect(src).toMatch(/ChartTooltip|ChartTip/);
  });
});
