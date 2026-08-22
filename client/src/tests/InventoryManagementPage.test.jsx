// ─────────────────────────────────────────────────────────────
// src/tests/InventoryManagementPage.test.jsx
//
// The page used to take `products` as a prop that App.jsx never
// passed, so it rendered an empty table and adjustments never left
// the browser. These tests pin the wiring: the manifest is fetched,
// adjustments are POSTed and then re-read from the server, the
// history drill-in calls the history endpoint, and the adjust action
// is hidden from roles the server would refuse anyway.
//
// Rewritten for the post-#46 UI. The old page had a single inline
// form with a "Product" <select>; product choice now comes from the
// table row, and AdjustStockModal receives the product as a prop.
// The assertions below therefore go through the row's "Adjust"
// button rather than getByLabelText('Product') — the intent above is
// unchanged, only the route the user takes through the UI.
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

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { getManifest, getMovements, adjustStock } = await import('../services/stockAPI');
const { default: InventoryManagementPage } = await import('../pages/InventoryManagementPage');

const RICE = {
  id: 7, name: 'Rice', sku: 'RICE-10', unit: 'kg',
  onHand: 100, reorderAt: 20, isShortfall: false, isLowStock: false,
};

// Opens the adjust modal for the first row and waits for it to mount.
// Every adjustment test starts here, so the row -> modal hop lives in
// one place rather than being repeated four times.
async function openAdjustModal(user) {
  const adjustBtn = await screen.findByRole('button', { name: /Adjust/ });
  await user.click(adjustBtn);
  return within(await screen.findByRole('dialog'));
}

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

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '12');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    // Direction "remove" has to arrive as a negative delta — the server
    // signs nothing for us, it just applies what it is given.
    await waitFor(() => expect(adjustStock).toHaveBeenCalledWith({
      productId: 7,
      quantityDelta: -12,
      unit: 'kg',
      reason: 'Damaged / spoiled',
    }));

    // Re-read, not local mutation: the second getManifest is the point
    // of the test. Optimistic local state would drift from the server.
    await waitFor(() => expect(getManifest).toHaveBeenCalledTimes(2));
  });

  it('blocks the save and never calls the API when the reason is missing', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    const modal = await openAdjustModal(user);
    await user.type(modal.getByLabelText(/Quantity/), '5');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    expect(await screen.findByText(/Select a reason for the adjustment/)).toBeInTheDocument();
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it('appends the free-text note to the reason so the audit ledger keeps it', async () => {
    const user = userEvent.setup();
    adjustStock.mockResolvedValue({ before: 100, after: 95, isShortfall: false });
    render(<InventoryManagementPage />);

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '5');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Spillage');
    await user.type(modal.getByLabelText(/Notes/), 'Pallet dropped at bay 3');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    await waitFor(() => expect(adjustStock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Spillage — Pallet dropped at bay 3' })
    ));
  });

  it('loads movement history when a product is drilled into', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    const historyBtn = await screen.findByRole('button', { name: /History/ });
    await user.click(historyBtn);

    await waitFor(() => expect(getMovements).toHaveBeenCalledWith(7));
  });

  it('hides the adjust action from roles the server would refuse anyway', async () => {
    mockUser.value = { id: 2, firstName: 'Mcebisi', lastName: 'N', role: 'warehouse_worker' };
    render(<InventoryManagementPage />);

    // History stays available to everyone; only Adjust is gated.
    expect(await screen.findByRole('button', { name: /History/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adjust/ })).not.toBeInTheDocument();
  });
});
