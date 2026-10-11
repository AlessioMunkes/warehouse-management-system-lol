// ─────────────────────────────────────────────────────────────
// src/tests/ReportChartTips.test.jsx
//
// The impact chart: names under the bars fit their slot instead of
// printing over one another, and each bar answers the pointer with
// its own tip, which is where the report's note now lives.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('hover tips', () => {
  const bar = (name) => {
    const groups = [...document.querySelectorAll('svg g')];
    return groups.find((g) => g.textContent.includes(name));
  };

  it('shows the full name, the figure, its share and the note', () => {
    render(<ReportChart report={report} note={NOTE} />);
    expect(screen.queryByTestId('chart-tip')).toBeNull();

    fireEvent.mouseEnter(bar('Mitchells'), { clientX: 200, clientY: 300 });
    const tip = screen.getByTestId('chart-tip');
    expect(tip).toHaveTextContent('Mitchells Plain');
    expect(tip).toHaveTextContent('30 kg');
    expect(tip).toHaveTextContent('30% of the total');
    expect(tip).toHaveTextContent('Counts every logged weigh-in.');

    fireEvent.mouseLeave(bar('Mitchells'));
    expect(screen.queryByTestId('chart-tip')).toBeNull();
  });

  it('gives no share for a percentage, which does not add up', () => {
    render(<ReportChart report={{ ...report, meta: { unit: '%' } }} />);
    fireEvent.mouseEnter(bar('Langa'), { clientX: 200, clientY: 300 });
    expect(screen.getByTestId('chart-tip')).not.toHaveTextContent('of the total');
  });

  it('stays quiet on a small preview card', () => {
    render(<ReportChart report={report} compact />);
    fireEvent.mouseEnter(bar('Langa'), { clientX: 200, clientY: 300 });
    expect(screen.queryByTestId('chart-tip')).toBeNull();
  });
});
