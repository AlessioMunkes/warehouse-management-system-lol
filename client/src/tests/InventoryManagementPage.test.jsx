// ─────────────────────────────────────────────────────────────
// src/tests/InventoryManagementPage.test.jsx
//
// The page used to take `products` as a prop that App.jsx never
// passed, so it rendered an empty table and adjustments never left
// the browser. These tests pin the wiring: the manifest is fetched,
// adjustments are POSTed and then re-read from the server, the
// history drill-in calls the history endpoint, and the adjust form
// is hidden from roles the server would refuse anyway.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/stockAPI', () => ({
  getManifest:  vi.fn(),
  getMovements: vi.fn(),
  adjustStock:  vi.fn(),
}));

const mockUser = { value: { id: 1, firstName: 'Grizel', lastName: 'M', role: 'manager' } };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.value, logout: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}));

const { getManifest, getMovements, adjustStock } = await import('../services/stockAPI');
const { default: InventoryManagementPage } = await import('../pages/InventoryManagementPage');

const RICE = {
  id: 7, name: 'Rice', sku: 'RICE-10', unit: 'kg',
  onHand: 100, reorderAt: 20, isShortfall: false, isLowStock: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.value = { id: 1, firstName: 'Grizel', lastName: 'M', role: 'manager' };
  getManifest.mockResolvedValue([RICE]);
  getMovements.mockResolvedValue([]);
});

describe('InventoryManagementPage', () => {
  it('fetches the manifest on mount and renders it', async () => {
    render(<InventoryManagementPage />);

    expect(await screen.findAllByText('Rice')).not.toHaveLength(0);
    expect(getManifest).toHaveBeenCalledTimes(1);
  });

  it('surfaces a load failure instead of showing a silently empty table', async () => {
    getManifest.mockRejectedValueOnce(new Error('Session expired. Please log in again.'));
    render(<InventoryManagementPage />);

    expect(await screen.findByText(/Session expired/)).toBeInTheDocument();
  });

  it('POSTs an adjustment and re-reads the manifest from the server', async () => {
    const user = userEvent.setup();
    adjustStock.mockResolvedValue({ before: 100, after: 88, isShortfall: false });
    render(<InventoryManagementPage />);

    // The product is picked by clicking its row's Adjust button, not
    // through a dropdown — the modal that opens is already scoped to it.
    await user.click(await screen.findByRole('button', { name: /Adjust/ }));

    await user.selectOptions(screen.getByLabelText('Direction'), 'remove');
    await user.type(screen.getByLabelText(/Quantity/), '12');
    await user.selectOptions(screen.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(screen.getByRole('button', { name: 'Save Adjustment' }));

    await waitFor(() => expect(adjustStock).toHaveBeenCalledWith({
      productId: 7,
      quantityDelta: -12,      // direction toggle supplies the sign
      unit: 'kg',
      reason: 'Damaged / spoiled',
    }));
    // Refetched rather than patched locally, so screen and ledger agree
    expect(getManifest).toHaveBeenCalledTimes(2);
  });

  it('blocks the save and never calls the API when the reason is missing', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('button', { name: /Adjust/ }));
    await user.type(screen.getByLabelText(/Quantity/), '5');
    await user.click(screen.getByRole('button', { name: 'Save Adjustment' }));

    expect(await screen.findByText(/Select a reason for the adjustment/)).toBeInTheDocument();
    expect(adjustStock).not.toHaveBeenCalled();
  });

  // TODO: on save, InventoryManagementPage closes the modal and
  // silently refetches — there is no on-screen confirmation of any
  // kind (success or shortfall) yet. This test pins the desired
  // behaviour; un-skip once a save notice is added to the page.
  it.skip('reports a shortfall as a warning, not a failure', async () => {
    const user = userEvent.setup();
    adjustStock.mockResolvedValue({ before: 5, after: -7, isShortfall: true });
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('button', { name: /Adjust/ }));
    await user.selectOptions(screen.getByLabelText('Direction'), 'remove');
    await user.type(screen.getByLabelText(/Quantity/), '12');
    await user.selectOptions(screen.getByLabelText('Reason'), 'Spillage');
    await user.click(screen.getByRole('button', { name: 'Save Adjustment' }));

    const notice = await screen.findByText(/Adjustment saved/);
    expect(notice).toHaveTextContent(/shortfall/i);
  });

  it('loads movement history when a product is drilled into', async () => {
    const user = userEvent.setup();
    getMovements.mockResolvedValue([{
      id: 1, quantity: -12, unit: 'kg', movementType: 'adjustment',
      reason: 'Damaged / spoiled', performedByName: 'Grizel',
      createdAt: '2026-07-01T09:00:00.000Z',
    }]);
    render(<InventoryManagementPage />);

    const buttons = await screen.findAllByRole('button', { name: /History/ });
    await user.click(buttons[0]);

    await waitFor(() => expect(getMovements).toHaveBeenCalledWith(7));

    // Scoped to the drawer: 'Damaged / spoiled' is also an <option> in
    // the adjust form's reason list, so an unscoped query matches twice.
    const modal = await screen.findByRole('dialog', { name: 'Rice' });
    expect(within(modal).getByText('Damaged / spoiled')).toBeInTheDocument();
    expect(within(modal).getByText(/-12/)).toBeInTheDocument();
  });

  it('hides the adjust action from a warehouse worker', async () => {
    mockUser.value = { id: 2, firstName: 'Bheki', lastName: 'N', role: 'warehouse_worker' };
    render(<InventoryManagementPage />);

    await screen.findAllByText('Rice');
    expect(screen.queryByRole('button', { name: /Adjust/ })).not.toBeInTheDocument();
    // History stays available to every role — only the write action is gated.
    expect(screen.getByRole('button', { name: /History/ })).toBeInTheDocument();
  });
});