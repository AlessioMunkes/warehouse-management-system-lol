// ─────────────────────────────────────────────────────────────
// src/tests/ReportExportNotes.test.jsx
//
// The Excel export every report shares, from both report charts
// (OperationalChart on the Operations reports page, ReportChart
// elsewhere). A report whose rows carry their own note (Days of stock
// left says where each product's demand and lead time came from) gets
// a "Worked out from" column. Every other report exports exactly as it
// always has: the same columns and the same row keys, nothing added.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('recharts', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 300 }),
  };
});
vi.mock('../lib/excelExport', () => ({ exportExcel: vi.fn() }));

const { exportExcel } = await import('../lib/excelExport');
const { default: OperationalChart } = await import('../features/reporting/OperationalChart');
const { default: ReportChart } = await import('../features/reporting/ReportChart');

const MAIZE_NOTE = 'Demand: Summer recipe. Order by 20 Oct (lead time: Assumed 7 days)';
const withNotes = {
  description: 'Days of stock left, by product, as it stands now',
  spec: { metric: 'days_of_cover', dimension: 'product' },
  chartType: 'hbar',
  meta: { unit: 'days' },
  series: [
    { label: 'Maize meal', value: 12, meta: { note: MAIZE_NOTE } },
    { label: 'Onions', value: 30, meta: { note: 'Demand: Sent out, last 8 weeks' } },
  ],
};
const withoutNotes = {
  description: 'Missed collections by centre',
  spec: { metric: 'repeat_non_collections', dimension: 'ecd_centre' },
  chartType: 'hbar',
  meta: { unit: 'missed collections' },
  series: [{ label: 'Ikhaya', value: 3 }, { label: 'Sunrise', value: 1 }],
};

const exported = () => exportExcel.mock.calls.at(-1)[0];
const exportFrom = (ui) => {
  render(ui);
  fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
  return exported();
};

beforeEach(() => vi.clearAllMocks());

describe('report export from the Operations reports chart', () => {
  it('adds a Worked out from column when the rows carry a note', () => {
    const sheet = exportFrom(<OperationalChart report={withNotes} dimensionLabel="Product" />);
    expect(sheet.columns.map((c) => c.label)).toEqual(['Product', 'Value', 'Unit', 'Worked out from']);
    expect(sheet.rows.find((r) => r.name === 'Maize meal').note).toBe(MAIZE_NOTE);
  });

  it('exports any other report exactly as before', () => {
    const sheet = exportFrom(<OperationalChart report={withoutNotes} dimensionLabel="ECD centre" />);
    expect(sheet.columns).toEqual([
      { key: 'name', label: 'ECD centre', kind: 'text' },
      { key: 'value', label: 'Value', kind: 'number' },
      { key: 'unit', label: 'Unit', kind: 'text' },
    ]);
    for (const row of sheet.rows) expect(Object.keys(row)).toEqual(['name', 'value', 'unit']);
  });
});

describe('report export from the report chart', () => {
  it('adds a Worked out from column when the rows carry a note', () => {
    const sheet = exportFrom(<ReportChart report={withNotes} dimensionLabel="Product" />);
    expect(sheet.columns.map((c) => c.label)).toEqual(['Product', 'days', 'Worked out from']);
    expect(sheet.rows.find((r) => r.label === 'Maize meal').note).toBe(MAIZE_NOTE);
  });

  it('exports any other report exactly as before', () => {
    const sheet = exportFrom(<ReportChart report={withoutNotes} dimensionLabel="ECD centre" />);
    expect(sheet.columns).toEqual([
      { key: 'label', label: 'ECD centre', kind: 'text' },
      { key: 'value', label: 'missed collections', kind: 'number' },
    ]);
    for (const row of sheet.rows) expect(Object.keys(row)).toEqual(['label', 'value']);
  });
});
