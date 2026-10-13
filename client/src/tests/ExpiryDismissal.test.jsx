// ─────────────────────────────────────────────────────────────
// src/tests/ExpiryDismissal.test.jsx
//
// A manager dismissing an expiry warning from a product's panel: a
// reason is required, the list and the manifest are read again after,
// a dismissed delivery shows who dismissed it and why and can be
// brought back, and a warehouse worker is not offered either.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/stockAPI', () => ({
  getManifest: vi.fn(),
  getMovements: vi.fn(),
  getBatches: vi.fn(),
  adjustStock: vi.fn(),
  dismissExpiryWarning: vi.fn(),
  restoreExpiryWarning: vi.fn(),
}));
vi.mock('@/lib/excelExport', () => ({ exportExcel: vi.fn() }));

const mockUser = { value: { id: 1, firstName: 'Grizel', lastName: 'M', role: 'manager' } };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.value, logout: vi.fn() }),
}));
const router = { params: new URLSearchParams(), setParams: vi.fn(), navigate: vi.fn() };
vi.mock('react-router-dom', () => ({
  useNavigate: () => router.navigate,
  useSearchParams: () => [router.params, router.setParams],
}));

const {
  getManifest, getMovements, getBatches, dismissExpiryWarning, restoreExpiryWarning,
} = await import('../services/stockAPI');
const { default: InventoryManagementPage } = await import('../pages/InventoryManagementPage');

const RICE = {
  id: 7, name: 'Rice', sku: 'RICE-10', unit: 'kg',
  onHand: 100, committed: 0, available: 100, reorderAt: 20,
  isShortfall: false, isLowStock: false, lastMovementAt: new Date().toISOString(),
  earliestExpiry: '2099-01-10', earliestExpiryLeft: 12,
};
const LIVE = {
  id: 31, expiryDate: '2099-01-10', receivedQuantity: 40, quantityLeft: 12, unit: 'kg',
  receivedOn: '2026-09-01', supplierName: 'Acme', daysLeft: 9000, dismissal: null,
};
const DISMISSED = {
  ...LIVE,
  dismissal: { id: 5, byName: 'Thandi Mokoena', at: '2026-10-12T09:00:00Z', reason: 'Checked the shelf, all gone' },
};

const openPanel = async (user) => {
  await user.click(await screen.findByRole('button', { name: 'Rice' }));
  return within(await screen.findByRole('dialog'));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.value = { id: 1, firstName: 'Grizel', lastName: 'M', role: 'manager' };
  getManifest.mockResolvedValue([RICE]);
  getMovements.mockResolvedValue([]);
  getBatches.mockResolvedValue([LIVE]);
  dismissExpiryWarning.mockResolvedValue({ id: 5 });
  restoreExpiryWarning.mockResolvedValue({ id: 5 });
});

describe('dismissing an expiry warning', () => {
  it('asks for a reason and does nothing without one', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);

    await user.click(await panel.findByRole('button', { name: 'Dismiss warning' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Dismiss expiry warning/ }));
    await user.click(dialog.getByRole('button', { name: 'Dismiss warning' }));

    expect(await dialog.findByText('Say why the warning is being dismissed.')).toBeInTheDocument();
    expect(dismissExpiryWarning).not.toHaveBeenCalled();
  });

  it('sends the reason for that delivery, then reads the list and the manifest again', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);
    getBatches.mockResolvedValue([DISMISSED]);

    await user.click(await panel.findByRole('button', { name: 'Dismiss warning' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Dismiss expiry warning/ }));
    await user.type(dialog.getByLabelText('Why is this warning wrong?'), '  Checked the shelf, all gone ');
    await user.click(dialog.getByRole('button', { name: 'Dismiss warning' }));

    await waitFor(() => expect(dismissExpiryWarning).toHaveBeenCalledWith(7, 31, 'Checked the shelf, all gone'));
    // The Expiring tab and the earliest expiry follow the change.
    await waitFor(() => expect(getManifest).toHaveBeenCalledTimes(2));
    expect(getBatches).toHaveBeenCalledTimes(2);
    expect(await panel.findByText(/Warning dismissed by Thandi Mokoena/)).toBeInTheDocument();
    expect(panel.getByText(/Checked the shelf, all gone/)).toBeInTheDocument();
  });

  it('keeps the dialog open and says why when the server refuses', async () => {
    dismissExpiryWarning.mockRejectedValueOnce(new Error('This warning is already dismissed.'));
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);

    await user.click(await panel.findByRole('button', { name: 'Dismiss warning' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Dismiss expiry warning/ }));
    await user.type(dialog.getByLabelText('Why is this warning wrong?'), 'Used it');
    await user.click(dialog.getByRole('button', { name: 'Dismiss warning' }));

    expect(await dialog.findByText('This warning is already dismissed.')).toBeInTheDocument();
    expect(getManifest).toHaveBeenCalledTimes(1);
  });

  it('shows a dismissed delivery with who and why, and brings the warning back', async () => {
    getBatches.mockResolvedValue([DISMISSED]);
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);

    expect(await panel.findByText('Warning dismissed')).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'Dismiss warning' })).not.toBeInTheDocument();
    getBatches.mockResolvedValue([LIVE]);
    await user.click(panel.getByRole('button', { name: 'Bring warning back' }));

    await waitFor(() => expect(restoreExpiryWarning).toHaveBeenCalledWith(7, 31));
    await waitFor(() => expect(getManifest).toHaveBeenCalledTimes(2));
    expect(await panel.findByRole('button', { name: 'Dismiss warning' })).toBeInTheDocument();
  });

  it('offers a warehouse worker neither, but still shows the dismissal', async () => {
    mockUser.value = { id: 2, firstName: 'Mcebisi', lastName: 'N', role: 'warehouse_worker' };
    getBatches.mockResolvedValue([DISMISSED]);
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);

    expect(await panel.findByText(/Warning dismissed by Thandi Mokoena/)).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'Bring warning back' })).not.toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'Dismiss warning' })).not.toBeInTheDocument();
  });

  it('does not offer to dismiss a delivery that has already expired', async () => {
    getBatches.mockResolvedValue([{ ...LIVE, expiryDate: '2020-01-01', daysLeft: -5 }]);
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);

    expect(await panel.findByText(/about 12 kg left of 40/)).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'Dismiss warning' })).not.toBeInTheDocument();
  });
});

describe('units in the delivery list', () => {
  it('say crates for several and crate for one', async () => {
    getBatches.mockResolvedValue([
      { ...LIVE, id: 1, unit: 'crate', receivedQuantity: 10, quantityLeft: 5 },
      { ...LIVE, id: 2, expiryDate: '2099-02-10', unit: 'crate', receivedQuantity: 10, quantityLeft: 1 },
    ]);
    const user = userEvent.setup();
    render(<InventoryManagementPage />);
    const panel = await openPanel(user);

    expect(await panel.findByText(/about 5 crates left of 10/)).toBeInTheDocument();
    expect(panel.getByText(/about 1 crate left of 10/)).toBeInTheDocument();
  });
});

describe('the estimate is said to be one', () => {
  it('gives the Earliest expiry column a tooltip, with about how much of that delivery is left', async () => {
    render(<InventoryManagementPage />);
    await screen.findByRole('button', { name: 'Rice' });

    expect(screen.getByRole('button', { name: 'Sort by Earliest expiry' })).toHaveAttribute('title', 'Estimated: assumes oldest stock goes out first');
    const cell = screen.getByRole('button', { name: 'Rice' }).closest('tr').querySelector('td[title]');
    expect(cell).toHaveAttribute('title', 'Estimated: assumes oldest stock goes out first. About 12 kg of that delivery left');
  });
});
