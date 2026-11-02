// ─────────────────────────────────────────────────────────────
// src/tests/ReportingTabs.test.jsx
//
// Operations reports is four tabs: Overview, Reports, Process map and
// Chart a spreadsheet. Each shows only its own part, a report asked
// for from the overview lands on Reports, and the two heavier tabs are
// not drawn until someone opens them.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const METRIC = {
  id: 'dispatch_volume', label: 'Food dispatched', description: '', unit: 'kg', temporal: true,
  defaultChart: 'line', dimensions: [{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }], filters: [],
};
const api = vi.hoisted(() => ({
  getCatalog: vi.fn(), runReport: vi.fn(), getComparisons: vi.fn(), runComparison: vi.fn(),
  saveTarget: vi.fn(), drillDown: vi.fn(), getSaved: vi.fn(), getFilterOptions: vi.fn(),
}));
vi.mock('../services/reportingAPI', () => api);

const stub = (name) => ({ default: () => <div>{name}</div> });
vi.mock('../features/reporting/TrendCard', () => ({
  default: ({ label, onExplore }) => <button type="button" onClick={() => onExplore()}>Explore {label}</button>,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, role: 'manager', warehouse: 'main' } }) }));
vi.mock('../features/reporting/AskBox', () => stub('ask box'));
vi.mock('../features/reporting/ReportBrowser', () => stub('report browser'));
vi.mock('../features/reporting/ReportBuilder', () => stub('report builder'));
vi.mock('../features/reporting/OperationalChart', () => stub('the chart'));
vi.mock('../features/reporting/OperationalInsight', () => stub('the insight'));
vi.mock('../features/reporting/ProcessMap', () => stub('the process map'));
vi.mock('../features/reporting/DataUpload', () => stub('the spreadsheet chart'));
vi.mock('../features/reporting/ExceptionAlerts', () => ({
  default: ({ onOpenReport }) => <button type="button" onClick={() => onOpenReport('dispatch_volume')}>open flagged report</button>,
}));
vi.mock('../features/reporting/SavedReports', () => ({ SavedReportsBar: () => <div>saved reports</div>, SaveReport: () => null }));

const { default: ReportingPage } = await import('../pages/ReportingPage');

const show = async () => {
  render(<MemoryRouter><ReportingPage /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'At a glance' });
};
const tab = (name) => screen.getByRole('tab', { name });

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lays nothing out, so it has no scrolling to do.
  Element.prototype.scrollIntoView = vi.fn();
  api.getCatalog.mockResolvedValue({ data: { aiEnabled: true, metrics: [METRIC], datasets: [] } });
  api.getSaved.mockResolvedValue({ data: [] });
  api.getComparisons.mockResolvedValue({ data: [] });
  api.getFilterOptions.mockResolvedValue({ data: {} });
  api.runReport.mockResolvedValue({ data: { description: 'Food dispatched by month', spec: { metric: 'dispatch_volume', dimension: 'month' }, rows: [], meta: {} } });
});

describe('the tabs on Operations reports', () => {
  it('draws the process map only when opened, and keeps it after', async () => {
    await show();
    expect(screen.queryByText('the process map')).not.toBeInTheDocument();
    await userEvent.click(tab('Process map'));
    expect(screen.getByText('the process map')).toBeVisible();
    await userEvent.click(tab('Exception alerts'));
    expect(screen.getByText('the process map')).not.toBeVisible();
  });

  // The reorder planner is on the Stock ledger now.
  it('has no Reorder planner tab', async () => {
    await show();
    expect(screen.queryByRole('tab', { name: 'Reorder planner' })).toBeNull();
  });

  // Workload is a report the AI draws as a heatmap now, not a tab.
  it('has no Workload tab', async () => {
    await show();
    expect(screen.queryByRole('tab', { name: 'Workload' })).toBeNull();
  });

  it('opens a flagged measure as its weekly report on the Reports tab', async () => {
    await show();
    await userEvent.click(tab('Exception alerts'));
    await userEvent.click(screen.getByRole('button', { name: 'open flagged report' }));
    await waitFor(() => expect(tab('Reports')).toHaveAttribute('aria-selected', 'true'));
    expect(api.runReport).toHaveBeenCalledWith(expect.objectContaining({ metric: 'dispatch_volume', dimension: 'week' }));
  });

  it('opens on the overview, with only the overview', async () => {
    await show();
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('saved reports')).toBeInTheDocument();
    expect(screen.queryByText('ask box')).not.toBeInTheDocument();
    expect(screen.queryByText('the process map')).not.toBeInTheDocument();
    expect(screen.queryByText('the spreadsheet chart')).not.toBeInTheDocument();
  });

  it('keeps asking, browsing and building on the Reports tab', async () => {
    await show();
    await userEvent.click(tab('Reports'));
    expect(screen.getByText('ask box')).toBeInTheDocument();
    expect(screen.getByText('report browser')).toBeInTheDocument();
    expect(screen.getByText('report builder')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'At a glance' })).not.toBeInTheDocument();
  });

  it('takes a report asked for from the overview to the Reports tab', async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: 'Explore Food dispatched' }));
    await waitFor(() => expect(tab('Reports')).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByText('Food dispatched by month')).toBeInTheDocument();
  });

  it('draws the process map and the spreadsheet chart on their own tabs', async () => {
    await show();
    await userEvent.click(tab('Process map'));
    expect(screen.getByText('the process map')).toBeVisible();
    expect(screen.queryByText('saved reports')).not.toBeInTheDocument();

    await userEvent.click(tab('Chart a spreadsheet'));
    expect(screen.getByText('the spreadsheet chart')).toBeVisible();
    // Kept, not thrown away: coming back finds it as it was left.
    expect(screen.getByText('the process map')).not.toBeVisible();
  });
});
