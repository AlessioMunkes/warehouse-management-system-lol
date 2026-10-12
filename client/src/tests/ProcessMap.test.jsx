// ─────────────────────────────────────────────────────────────
// src/tests/ProcessMap.test.jsx
//
// The process map on the Operations reports page. It must not load
// until it is opened, must show each wait in words a person uses, and
// must open what is behind a wait when that wait is chosen.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ getProcessMap: vi.fn() }));
vi.mock('../services/reportingAPI', () => api);
vi.mock('../lib/excelExport', () => ({ exportExcel: vi.fn() }));

const { default: ProcessMap } = await import('../features/reporting/ProcessMap');
const { duration, sheetRows } = await import('../features/reporting/processFormat');

const t = (id, label, medianHours, cases = 4) => ({
  id, label, cases, medianHours, averageHours: medianHours, p90Hours: medianHours === null ? null : medianHours * 2,
  slowest: cases ? [{ id: 1, label: `Slow one at ${label}`, hours: medianHours * 3 }] : [],
});

const DATA = {
  range: { from: '2026-08-01', to: '2026-10-12' },
  empty: false,
  bottleneck: { lane: 'inbound', id: 'approved_delivered', label: 'Approved to first delivery', medianHours: 72, cases: 4 },
  endToEnd: { medianHours: 200, parts: [] },
  lanes: [
    {
      id: 'inbound', label: 'Order to shelf', caseNoun: 'purchase orders', cases: 4,
      steps: [{ id: 'raised', label: 'Order raised', cases: 4 }, { id: 'approved', label: 'Approved', cases: 4 }, { id: 'firstDelivery', label: 'First delivery', cases: 3 }],
      path: ['raised_approved', 'approved_delivered'], headline: 'raised_delivered',
      transitions: [t('raised_approved', 'Waiting for approval', 0.5), t('approved_delivered', 'Approved to first delivery', 72), t('raised_delivered', 'Raised to first delivery', 73)],
      variants: [{ label: 'Delivered in full, on time', cases: 3, share: 75 }, { label: 'Not delivered yet', cases: 1, share: 25 }],
      groups: [{ id: 'supplier', label: 'By supplier, raised to first delivery', rows: [{ label: 'Cape Dry Goods', cases: 3, medianHours: 73 }] }],
      note: null,
    },
    {
      id: 'shelf', label: 'On the shelf', caseNoun: 'dispatched quantities', cases: 9, estimate: true,
      steps: [{ id: 'received', label: 'Received into stock', cases: 9 }, { id: 'dispatched', label: 'Left on a pallet', cases: 9 }],
      path: ['received_dispatched'], headline: 'received_dispatched',
      transitions: [t('received_dispatched', 'On the shelf', 120, 9)],
      variants: [], groups: [], note: 'An estimate. Stock is not tracked by batch.',
    },
    {
      id: 'outbound', label: 'Slip to dispatch note', caseNoun: 'pallets', cases: 2,
      steps: [{ id: 'generated', label: 'Slip raised', cases: 2 }, { id: 'claimed', label: 'Claimed', cases: 0 }],
      path: ['generated_claimed'], headline: 'generated_collected',
      transitions: [t('generated_claimed', 'Waiting to be claimed', null, 0), t('generated_collected', 'Slip raised to collected', null, 0)],
      variants: [{ label: 'Not claimed yet', cases: 2, share: 100 }], groups: [], note: null,
    },
  ],
};

const openMap = async () => {
  render(<ProcessMap suppliers={[{ value: '3', label: 'Cape Dry Goods' }]} />);
  await userEvent.click(screen.getByRole('button', { name: 'Process map' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getProcessMap.mockResolvedValue({ data: DATA });
});

describe('duration', () => {
  it('says a wait the way a person would', () => {
    expect(duration(0.25)).toBe('15 min');
    expect(duration(1)).toBe('1 hour');
    expect(duration(3.5)).toBe('3.5 hours');
    expect(duration(72)).toBe('3 days');
    expect(duration(null)).toBe('No time yet');
  });
});

describe('the process map', () => {
  it('asks for nothing until it is opened', async () => {
    render(<ProcessMap />);
    expect(api.getProcessMap).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Process map' }));
    await waitFor(() => expect(api.getProcessMap).toHaveBeenCalledTimes(1));
    expect(api.getProcessMap.mock.calls[0][1]).toEqual({ supplierId: null, cohort: null, beneficiaryKind: null });
  });

  it('draws the three parts, the end-to-end time and the slowest step', async () => {
    await openMap();
    expect(await screen.findByRole('heading', { name: 'Order to shelf' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /On the shelf/ })).toHaveTextContent('Estimate');
    expect(screen.getByRole('heading', { name: 'Slip to dispatch note' })).toBeInTheDocument();
    expect(screen.getByText('8.3 days')).toBeInTheDocument();
    expect(screen.getByText('Approved to first delivery: 3 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approved to first delivery, the slowest step/ })).toBeInTheDocument();
  });

  it('opens what is behind a wait, and closes it again', async () => {
    await openMap();
    const arrow = await screen.findByRole('button', { name: /Waiting for approval/ });
    await userEvent.click(arrow);
    const detail = screen.getByRole('region', { name: 'Waiting for approval: what is behind it' });
    expect(within(detail).getByText('Slowest purchase orders')).toBeInTheDocument();
    expect(within(detail).getByText('Slow one at Waiting for approval')).toBeInTheDocument();
    expect(within(detail).getByText('Routes taken')).toBeInTheDocument();
    expect(within(detail).getByText('3 · 75%')).toBeInTheDocument();
    expect(within(detail).getByText('Cape Dry Goods')).toBeInTheDocument();

    await userEvent.click(arrow);
    expect(screen.queryByRole('region', { name: /what is behind it/ })).not.toBeInTheDocument();
  });

  it('says so when nothing has been through a step', async () => {
    await openMap();
    await userEvent.click(await screen.findByRole('button', { name: /Waiting to be claimed/ }));
    expect(screen.getByText(/Nothing has been through this step/)).toBeInTheDocument();
  });

  it('loads again when a filter changes', async () => {
    await openMap();
    await screen.findByRole('heading', { name: 'Order to shelf' });
    await userEvent.selectOptions(screen.getByLabelText('Supplier'), '3');
    await waitFor(() => expect(api.getProcessMap).toHaveBeenCalledTimes(2));
    expect(api.getProcessMap.mock.calls[1][1]).toMatchObject({ supplierId: '3' });
  });

  it('says a period with nothing in it is empty', async () => {
    api.getProcessMap.mockResolvedValue({ data: { ...DATA, empty: true } });
    await openMap();
    expect(await screen.findByText(/Nothing was ordered, packed or dispatched/)).toBeInTheDocument();
  });

  it('writes every step of every part to the sheet', () => {
    const rows = sheetRows(DATA);
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.step === 'On the shelf').basis).toBe('Estimate, oldest stock first');
  });

  it('uses no em dashes in what people read', async () => {
    await openMap();
    await userEvent.click(await screen.findByRole('button', { name: /Waiting for approval/ }));
    expect(document.body.textContent).not.toMatch(/—/);
  });
});
