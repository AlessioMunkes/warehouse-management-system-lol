// ─────────────────────────────────────────────────────────────
// src/tests/ChartMotion.test.jsx
//
// Charts honour the app's "Reduce movement" switch. Recharts animates
// in JavaScript, so the CSS attribute the switch sets cannot stop it;
// each chart asks useChartMotion instead. With movement reduced a
// chart is drawn finished at once, figures and all.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneElement } from 'react';
import { render, screen, renderHook } from '@testing-library/react';
import { ReducedMotionContext, MOTION_KEY } from '../components/layout/shellContext';

vi.mock('recharts', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 300 }),
  };
});

const { useChartMotion } = await import('../features/reporting/useChartMotion');
const { default: ReportChart } = await import('../features/reporting/ReportChart');
const { default: BeneficiaryTypeChart } = await import('../features/reporting/BeneficiaryTypeChart');

const reduced = (on) => ({ children }) => (
  <ReducedMotionContext.Provider value={{ reducedMotion: on, setReducedMotion: () => {} }}>
    {children}
  </ReducedMotionContext.Provider>
);

beforeEach(() => {
  try { localStorage.removeItem(MOTION_KEY); } catch { /* none */ }
});

describe('chart motion', () => {
  it('animates by default', () => {
    const { result } = renderHook(() => useChartMotion(), { wrapper: reduced(false) });
    expect(result.current).toBe(true);
  });

  it('stops when Reduce movement is on', () => {
    const { result } = renderHook(() => useChartMotion(), { wrapper: reduced(true) });
    expect(result.current).toBe(false);
  });

  it('stops outside the shell when this device saved the setting', () => {
    localStorage.setItem(MOTION_KEY, 'true');
    const { result } = renderHook(() => useChartMotion());
    expect(result.current).toBe(false);
  });

  it('draws the chart finished, with every figure printed, when movement is reduced', () => {
    const report = {
      description: 'Compost processed by region', chartType: 'bar',
      spec: { metric: 'compost_processed', dimension: 'region' },
      series: [{ label: 'Langa', value: 60 }, { label: 'Bonteheuwel', value: 10 }],
      meta: { unit: 'kg' },
    };
    render(<ReportChart report={report} />, { wrapper: reduced(true) });
    expect(screen.getAllByText('60').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
  });

  // A period where nobody was reached still says so on every row.
  it('prints a zero on each row when every figure is zero', () => {
    const items = [
      { metric: 'children_reached', label: 'Children (ECD)', unit: 'children', color: 'var(--viz-1)', stat: { value: 0 } },
      { metric: 'adults_reached', label: 'Adults', unit: 'adults', color: 'var(--viz-4)', stat: { value: 0 } },
    ];
    render(<BeneficiaryTypeChart items={items} />, { wrapper: reduced(true) });
    expect(screen.getByText('0 children')).toBeInTheDocument();
    expect(screen.getByText('0 adults')).toBeInTheDocument();
  });
});
