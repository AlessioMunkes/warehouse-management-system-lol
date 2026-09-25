// ─────────────────────────────────────────────────────────────
// src/tests/WrongDayCollection.test.jsx
// @sentinel script-53-wrong-day-advisory
//
// A pallet booked for another day used to stop a warehouse worker at
// the gate: "Ask a manager to authorise this collection." The server
// had already stopped enforcing that (see the note in
// dispatch.service.js's collect()) — the gate board deliberately
// lists every outstanding pallet on ANY date, which makes nearly all
// of them wrongDay, and a driver standing at the gate has already
// solved the harder problem. PalletCheck.jsx was still refusing on
// its own, so the screen was stricter than the API behind it.
//
// These two tests pin the difference: the wrong day is advisory and
// lets the worker through, an unpacked pallet still is not.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../services/dispatchAPI', () => ({
  default: { getGateQueue: vi.fn(), getGateView: vi.fn(), recordCollection: vi.fn() },
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
const { default: PalletCheck } = await import('../features/dispatch/components/PalletCheck');

const ELIGIBILITY = {
  ecdInactive: false, slipNotPacked: false, wrongDay: false,
  afterCutoff: false, writtenOff: false, alreadyDispatched: false,
  hasFlaggedLines: false, hasVariance: false,
};

const gateView = (eligibility) => ({
  picking_slip_id: 31,
  ecd_name: 'Ikhaya Lethemba Educare',
  pallet_ref: 'PAL-31',
  cohort: 'week1',
  // Booked for a Monday; "today" in these tests is not that day.
  dispatch_date: '2026-08-17',
  slip_status: 'complete',
  items: [{
    id: 1, product_name: 'Maize meal', sku: 'MM-10', unit: 'kg',
    required_quantity: 10, packed_quantity: 10, status: 'confirmed',
  }],
  eligibility: { ...ELIGIBILITY, ...eligibility },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a pallet booked for another day', () => {
  it('does not stop a warehouse worker from releasing it', async () => {
    dispatchAPI.getGateView.mockResolvedValue(gateView({ wrongDay: true }));
    render(<PalletCheck palletId={31} onBack={() => {}} onCollected={() => {}} />);

    const start = await screen.findByRole('button', { name: /Start the collection/ });
    expect(start).toBeEnabled();

    // Advisory, not a refusal: it says what is off about the pallet
    // without telling the worker to go and find someone.
    expect(screen.getByText(/is booked for another day/)).toBeInTheDocument();
    expect(screen.queryByText(/Ask a manager to authorise/)).not.toBeInTheDocument();
  });

  it('still blocks a pallet packing has not closed off', async () => {
    dispatchAPI.getGateView.mockResolvedValue(gateView({ slipNotPacked: true }));
    render(<PalletCheck palletId={31} onBack={() => {}} onCollected={() => {}} />);

    const start = await screen.findByRole('button', { name: /Start the collection/ });
    expect(start).toBeDisabled();
    expect(screen.getByText(/Ask a manager to authorise/)).toBeInTheDocument();
  });
});
