// ─────────────────────────────────────────────────────────────
// src/tests/DispatchWiring.test.jsx
//
// PalletCheck.jsx spent several commits as a byte-for-byte copy of
// GateQueue.jsx — a paste into the wrong file. Nothing caught it:
// it compiled, it linted, it built, and the component even rendered.
// Clicking a row on the gate board swapped DispatchPage to
// PalletCheck, which drew the gate board again, so the screen looked
// unchanged and the bug read as "clicking does nothing".
//
// The props are what give it away. PalletCheck takes palletId /
// onBack / onCollected; GateQueue takes onOpenPallet. A copy has the
// wrong signature and silently ignores everything DispatchPage hands
// it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/dispatchAPI', () => ({
  default: { getGateQueue: vi.fn(), getGateView: vi.fn(), collect: vi.fn() },
  todayISO: () => '2026-08-22',
  newIdempotencyKey: () => 'test-key',
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, firstName: 'M', role: 'warehouse_worker' }, logout: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/staff/dispatch' }),
  Link: ({ children }) => <span>{children}</span>,
}));

const dispatchAPI = (await import('../services/dispatchAPI')).default;
const { default: DispatchPage } = await import('../pages/DispatchPage');

const ROW = {
  picking_slip_id: 31,
  ecd_name: 'Little Lights Creche',
  pallet_ref: 'PAL-31',
  dispatch_status: 'awaiting',
  ecd_is_active: true,
  total_items: 4,
  flagged_items: 0,
  variance_items: 0,
  collected_at: null,
  dispatch_date: '2026-08-22',
};

beforeEach(() => {
  vi.clearAllMocks();
  dispatchAPI.getGateQueue.mockResolvedValue([ROW]);
  dispatchAPI.getGateView.mockResolvedValue({
    picking_slip_id: 31,
    ecd_name: 'Little Lights Creche',
    dispatch_date: '2026-08-22',
    slip_status: 'complete',
    items: [],
    eligibility: {
      ecdInactive: false, slipNotPacked: false, wrongDay: false,
      afterCutoff: false, writtenOff: false, alreadyDispatched: false,
      hasFlaggedLines: false, hasVariance: false,
    },
  });
});

describe('dispatch gate wiring', () => {
  it('opening a pallet leaves the queue and fetches that pallet', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);

    const row = await screen.findByRole('button', { name: /Little Lights Creche/ });
    await user.click(row);

    // The bug: PalletCheck was a copy of GateQueue, so it re-fetched
    // the board and never asked for the pallet. This is the assertion
    // that would have caught it.
    await waitFor(() => expect(dispatchAPI.getGateView).toHaveBeenCalledWith(31));
  });

  it('the board is no longer on screen once a pallet is open', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);

    await user.click(await screen.findByRole('button', { name: /Little Lights Creche/ }));

    // "At the gate" is GateQueue's heading. If it is still showing
    // after a row is opened, the page did not actually change screens.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'At the gate' })).not.toBeInTheDocument()
    );
  });
});
