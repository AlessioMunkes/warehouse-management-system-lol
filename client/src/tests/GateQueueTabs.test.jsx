// ─────────────────────────────────────────────────────────────
// src/tests/GateQueueTabs.test.jsx
//
// The gate list: three tabs that say what they hold (Awaiting dispatch,
// Late, Dispatched), opening on what there is to do, and a row that is
// the centre with its pallet number underneath.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/dispatchAPI', () => ({ default: { getGateQueue: vi.fn() } }));

const dispatchAPI = (await import('../services/dispatchAPI')).default;
const { default: GateQueue } = await import('../features/dispatch/GateQueue');

const row = (over) => ({
  picking_slip_id: 1, ecd_name: 'Amaphiko ECD', pallet_ref: 'P-688', dispatch_date: '2026-10-13T00:00:00+02:00',
  dispatch_status: 'awaiting', total_items: 21, flagged_items: 0, variance_items: 0, ecd_is_active: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  dispatchAPI.getGateQueue.mockResolvedValue([
    row(),
    row({ picking_slip_id: 2, ecd_name: 'Late Kids', pallet_ref: 'P-700', dispatch_status: 'not_collected' }),
    row({ picking_slip_id: 3, ecd_name: 'Gone Already', pallet_ref: 'P-701', dispatch_status: 'collected',
          collected_at: '2026-10-13T09:10:00+02:00', driver_name: 'Dumisani' }),
  ]);
});

describe('the gate list', () => {
  it('opens on Awaiting dispatch, with no All tab', async () => {
    render(<GateQueue onOpenPallet={vi.fn()} />);
    expect(await screen.findByRole('tab', { name: 'Awaiting dispatch (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Late (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dispatched (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^All/ })).not.toBeInTheDocument();

    expect(screen.getByText('Amaphiko ECD')).toBeInTheDocument();
    expect(screen.queryByText('Late Kids')).not.toBeInTheDocument();
  });

  it('shows the centre as the title and the pallet number under it, with no "ready for dispatch"', async () => {
    render(<GateQueue onOpenPallet={vi.fn()} />);
    const title = await screen.findByText('Amaphiko ECD');
    expect(title).toHaveClass('stf-row-title');
    const meta = document.querySelector('.stf-row-meta').textContent;
    expect(meta).toMatch(/^P-688 · /);
    expect(meta).not.toMatch(/ready for dispatch|cut-off/);
  });

  it('keeps late and dispatched pallets on their own tabs', async () => {
    const user = userEvent.setup();
    render(<GateQueue onOpenPallet={vi.fn()} />);

    await user.click(await screen.findByRole('tab', { name: 'Late (1)' }));
    expect(screen.getByText('Late Kids')).toBeInTheDocument();
    expect(screen.getByText('P-700 · Missed its cut-off')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Dispatched (1)' }));
    expect(screen.getByText('Gone Already')).toBeInTheDocument();
    expect(screen.getByText(/^P-701 · .* · Dumisani$/)).toBeInTheDocument();
  });

  it('searches across every tab', async () => {
    const user = userEvent.setup();
    render(<GateQueue onOpenPallet={vi.fn()} />);
    await user.type(await screen.findByLabelText('Search by centre, pallet or driver'), 'P-701');
    expect(screen.getByText('Gone Already')).toBeInTheDocument();
  });
});
