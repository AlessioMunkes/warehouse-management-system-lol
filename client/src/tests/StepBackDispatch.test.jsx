// ─────────────────────────────────────────────────────────────
// client/src/tests/StepBackDispatch.test.jsx
//
// Dispatch's step back. On a pallet's first screen the shell's "‹" keeps
// going to the gate queue. On the loading screen it goes back to the
// pallet's details ("‹ Check the pallet"), with the driver, the counts and
// the ticks kept. The arrow at the top left is not touched (the shell is
// stubbed here to expose only onBack/backLabel).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
vi.mock('../features/procurement/components/SignaturePad', () => ({
  default: ({ onChange }) => <button type="button" onClick={() => onChange('data:image/png;base64,sig')}>Sign</button>,
}));
vi.mock('../components/layout/StaffShell', () => ({
  default: ({ children, crumb, onBack, backLabel }) => (
    <div>
      <p data-testid="crumb">{crumb}</p>
      {onBack ? <button type="button" onClick={onBack}>{`‹ ${backLabel}`}</button> : null}
      {children}
    </div>
  ),
}));

const dispatchAPI = (await import('../services/dispatchAPI')).default;
const { default: DispatchPage } = await import('../pages/DispatchPage');

const ROW = {
  picking_slip_id: 31, ecd_name: 'Little Lights Creche', pallet_ref: 'PAL-31', dispatch_status: 'awaiting',
  ecd_is_active: true, total_items: 2, flagged_items: 0, variance_items: 0, collected_at: null, dispatch_date: '2026-08-22',
};
const GATE_VIEW = {
  picking_slip_id: 31, ecd_name: 'Little Lights Creche', dispatch_date: '2026-08-22', slip_status: 'complete',
  items: [
    { id: 1, product_name: 'Maize meal', sku: 'MAIZE', unit: 'kg', required_quantity: 10, packed_quantity: 10 },
    { id: 2, product_name: 'Sugar beans', sku: 'BEANS', unit: 'kg', required_quantity: 5, packed_quantity: 5 },
  ],
  eligibility: {
    ecdInactive: false, slipNotPacked: false, wrongDay: false, afterCutoff: false,
    writtenOff: false, alreadyDispatched: false, hasFlaggedLines: false, hasVariance: false,
  },
};

const TO_PALLET_DETAILS = '‹ Check the pallet';
const TO_QUEUE = '‹ Gate queue';

const openPallet = async (user) => {
  await user.click(await screen.findByRole('button', { name: /Little Lights Creche/ }));
  await screen.findByRole('button', { name: 'Start the collection' });
};
const startCollection = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Start the collection' }));
  await screen.findByLabelText("Driver's name");
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); localStorage.setItem('stf_dispatch_view_mode', 'full'); } catch { /* ignore */ }
  dispatchAPI.getGateQueue.mockResolvedValue([ROW]);
  dispatchAPI.getGateView.mockResolvedValue(GATE_VIEW);
});

describe('Dispatch: the step back', () => {
  it('on the queue there is none; on a pallet\'s first screen it goes to the gate queue', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);
    await screen.findByRole('button', { name: /Little Lights Creche/ });
    expect(screen.queryByRole('button', { name: TO_QUEUE })).not.toBeInTheDocument();

    await openPallet(user);
    expect(screen.getByRole('button', { name: TO_QUEUE })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TO_PALLET_DETAILS })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TO_QUEUE }));
    expect(await screen.findByRole('button', { name: /Little Lights Creche/ })).toBeInTheDocument();
  });

  it('on the loading screen it goes back to the pallet\'s details, and the crumb follows', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);
    await openPallet(user);
    await startCollection(user);
    expect(screen.getByTestId('crumb')).toHaveTextContent('Load and release');
    expect(screen.getByRole('button', { name: TO_PALLET_DETAILS })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TO_QUEUE })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TO_PALLET_DETAILS }));
    expect(await screen.findByRole('button', { name: 'Start the collection' })).toBeInTheDocument();
    expect(screen.getByTestId('crumb')).toHaveTextContent('Which pallet');
    // Back on the first screen of the pallet: the queue is one step further.
    expect(screen.getByRole('button', { name: TO_QUEUE })).toBeInTheDocument();
  });

  it('keeps the driver, the counts and the ticks when you go back and start again', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);
    await openPallet(user);
    await startCollection(user);

    await user.type(screen.getByLabelText("Driver's name"), 'Sipho');
    await user.click(screen.getByRole('button', { name: 'Confirm Maize meal' }));
    expect(await screen.findByText(/a tick on 1 more line\b/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TO_PALLET_DETAILS }));
    await user.click(await screen.findByRole('button', { name: 'Start the collection' }));

    expect(await screen.findByLabelText("Driver's name")).toHaveValue('Sipho');
    expect(screen.getByText(/a tick on 1 more line\b/)).toBeInTheDocument();
    // Same pallet, same list: it was not fetched and rebuilt.
    expect(dispatchAPI.getGateView).toHaveBeenCalledTimes(1);
  });

  it('still starts clean on a pallet you have not been back to (ticks reset as before)', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);
    await openPallet(user);
    await startCollection(user);
    expect(screen.getByText(/a tick on 2 more lines/)).toBeInTheDocument();
  });

  it('is not offered while the collection is being saved, and comes back if the save fails', async () => {
    const user = userEvent.setup();
    let fail;
    dispatchAPI.recordCollection.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<DispatchPage />);
    await openPallet(user);
    await startCollection(user);
    await user.type(screen.getByLabelText("Driver's name"), 'Sipho');
    await user.click(screen.getByRole('button', { name: /Everything as packed/ }));
    await user.click(screen.getByRole('button', { name: 'Sign' }));
    await user.click(screen.getByRole('button', { name: 'Confirm collection' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: TO_PALLET_DETAILS })).not.toBeInTheDocument());
    // And the page's own "‹ Gate queue" must not slip in as a way out either.
    expect(screen.queryByRole('button', { name: TO_QUEUE })).not.toBeInTheDocument();

    fail(new Error('Network down'));
    expect(await screen.findByRole('button', { name: TO_PALLET_DETAILS })).toBeInTheDocument();
  });
});
