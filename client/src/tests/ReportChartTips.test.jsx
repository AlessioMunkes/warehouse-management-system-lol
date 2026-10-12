// ─────────────────────────────────────────────────────────────
// src/tests/ReportChartTips.test.jsx
//
// The impact chart: names under the bars fit their slot instead of
// printing over one another, and each bar answers the pointer with
// its own tip, which is where the report's note now lives.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { cloneElement } from 'react';
import { render, screen } from '@testing-library/react';

const tooltips = [];
vi.mock('recharts', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 300 }),
    Tooltip: (props) => { tooltips.push(props); return null; },
  };
});
import ReportChart from '../features/reporting/ReportChart';
import { fitLabel, noteLines } from '../features/reporting/chartFormat';

const NOTE = "Counts every logged weigh-in. Region is the kit owner's registered suburb.";
const report = {
  description: 'Compost processed by region',
  chartType: 'bar',
  spec: { metric: 'compost_processed', dimension: 'region' },
  series: [
    { label: 'Langa', value: 60 },
    { label: 'Mitchells Plain', value: 30 },
    { label: 'Bonteheuwel', value: 10 },
  ],
  meta: { unit: 'kg' },
};

describe('axis labels', () => {
  it('leaves a name that fits alone', () => {
    expect(fitLabel('Langa', 64)).toEqual(['Langa']);
  });

  it('breaks a long name at a space', () => {
    expect(fitLabel('Mitchells Plain', 64)).toEqual(['Mitchells', 'Plain']);
  });

  it('cuts a single long word to the slot', () => {
    const [line] = fitLabel('Bonteheuwel', 64);
    expect(line.endsWith('…')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(9);
  });

  it('never returns more than two lines', () => {
    expect(fitLabel('Cape Town City Bowl North', 40)).toHaveLength(2);
  });
});

describe('a report note', () => {
  it('is one point per sentence', () => {
    expect(noteLines(NOTE)).toEqual([
      'Counts every logged weigh-in.',
      "Region is the kit owner's registered suburb.",
    ]);
    expect(noteLines(undefined)).toEqual([]);
  });
});

// jsdom has no layout, so Recharts is given a fixed size and its
// Tooltip is captured: the test renders the tip the chart configured,
// for a bar it names, the way Recharts would on hover.
describe('hover tips', () => {
  const tipFor = (name) => {
    const props = tooltips.at(-1);
    const row = report.series.find((r) => r.label === name);
    return render(cloneElement(props.content, {
      active: true, label: name, payload: [{ value: row.value, name: 'value', payload: { name } }],
    }));
  };

  it('shows the full name, the figure, its share and the note', () => {
    render(<ReportChart report={report} note={NOTE} />);
    tipFor('Mitchells Plain');
    const tip = screen.getByTestId('chart-tip');
    expect(tip).toHaveTextContent('Mitchells Plain');
    expect(tip).toHaveTextContent('30 kg');
    expect(tip).toHaveTextContent('30% of the total');
    expect(tip).toHaveTextContent('Counts every logged weigh-in.');
  });

  it('gives no share for a percentage, which does not add up', () => {
    render(<ReportChart report={{ ...report, meta: { unit: '%' } }} />);
    tipFor('Langa');
    expect(screen.getByTestId('chart-tip')).not.toHaveTextContent('of the total');
  });

  it('stays quiet on a small preview card', () => {
    tooltips.length = 0;
    render(<ReportChart report={report} compact />);
    expect(tooltips).toHaveLength(0);
  });
});
