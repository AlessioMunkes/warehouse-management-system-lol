// ─────────────────────────────────────────────────────────────
// src/tests/InventoryManagementPage.test.jsx
//
// The page used to take `products` as a prop that App.jsx never
// passed, so it rendered an empty table and adjustments never left
// the browser. These tests pin the wiring: the manifest is fetched,
// adjustments are POSTed and then re-read from the server, opening a
// product loads its history and expiry lines, and the adjust action is
// hidden from roles the server would refuse anyway.
//
// Rewritten for the shared list pattern (view tabs, toolbar, bulk bar,
// detail panel). Adjust now lives in the product's panel and in the
// bulk bar rather than as an icon on every row, so the adjustment
// tests go row name -> panel -> Adjust stock. The intent of each test
// is unchanged; only the route through the UI is.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/stockAPI', () => ({
  getManifest:  vi.fn(),
  getMovements: vi.fn(),
  getBatches:   vi.fn(),
  adjustStock:  vi.fn(),
}));

vi.mock('@/features/reporting/chartFormat', () => ({
  toCsv: vi.fn(() => 'csv'),
  downloadCsv: vi.fn(),
}));

const mockUser = { value: { id: 1, firstName: 'Grizel', lastName: 'M', role: 'manager' } };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.value, logout: vi.fn() }),
}));

const router = { params: new URLSearchParams(), setParams: vi.fn(), navigate: vi.fn() };
vi.mock('react-router-dom', () => ({
  useNavigate: () => router.navigate,
  useSearchParams: () => [router.params, router.setParams],
}));

const { getManifest, getMovements, getBatches, adjustStock } = await import('../services/stockAPI');
const { toCsv, downloadCsv } = await import('@/features/reporting/chartFormat');
const { default: InventoryManagementPage } = await import('../pages/InventoryManagementPage');

const RICE = {
  id: 7, name: 'Rice', sku: 'RICE-10', unit: 'kg',
  onHand: 100, committed: 0, available: 100, reorderAt: 20,
  isShortfall: false, isLowStock: false, lastMovementAt: new Date().toISOString(),
};
const BEANS = {
  id: 8, name: 'Sugar beans', sku: 'BEA-001', unit: 'kg',
  onHand: 30, committed: 0, available: 30, reorderAt: 50,
  isShortfall: false, isLowStock: true, lastMovementAt: new Date().toISOString(),
};
const LENTILS = {
  id: 9, name: 'Red lentils', sku: 'LEN-001', unit: 'kg',
  onHand: 18, committed: 23, available: -5, reorderAt: 30,
  isShortfall: true, isLowStock: true, lastMovementAt: new Date().toISOString(),
};

// Name -> panel -> Adjust stock -> the adjustment dialog.
async function openAdjustModal(user, name = 'Rice') {
  await user.click(await screen.findByRole('button', { name }));
  const panel = within(await screen.findByRole('dialog'));
  await user.click(panel.getByRole('button', { name: /Adjust stock/ }));
  return within(await screen.findByRole('dialog', { name: new RegExp(`Adjust stock · ${name}`) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  router.params = new URLSearchParams();
  mockUser.value = { id: 1, firstName: 'Grizel', lastName: 'M', role: 'manager' };
  getManifest.mockResolvedValue([RICE]);
  getMovements.mockResolvedValue([]);
  getBatches.mockResolvedValue([]);
});

describe('InventoryManagementPage — data', () => {
  it('fetches the manifest on mount and renders it', async () => {
    render(<InventoryManagementPage />);

    expect(await screen.findByRole('button', { name: 'Rice' })).toBeInTheDocument();
    expect(getManifest).toHaveBeenCalledTimes(1);
  });

  it('surfaces a load failure instead of showing a silently empty table', async () => {
    getManifest.mockRejectedValueOnce(new Error('Session expired. Please log in again.'));
    render(<InventoryManagementPage />);

    expect(await screen.findByText(/Session expired/)).toBeInTheDocument();
  });
});

describe('InventoryManagementPage — detail panel', () => {
  it('loads movement history and expiry lines when a product is opened', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('button', { name: 'Rice' }));

    await waitFor(() => expect(getMovements).toHaveBeenCalledWith(7));
    expect(getBatches).toHaveBeenCalledWith(7);
    expect(await screen.findByRole('dialog')).toHaveTextContent('RICE-10');
  });

  it('lists expiry lines as received quantities, soonest first as the server sent them', async () => {
    getBatches.mockResolvedValue([
      { id: 1, expiryDate: '2099-01-10', receivedQuantity: 40, unit: 'kg', receivedOn: '2026-09-01', supplierName: 'Acme', daysLeft: 9000 },
    ]);
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('button', { name: 'Rice' }));
    const panel = within(await screen.findByRole('dialog'));

    expect(await panel.findByText(/Acme/)).toBeInTheDocument();
    expect(panel.getByText(/not what remains/)).toBeInTheDocument();
  });

  it('hides the adjust action from roles the server would refuse anyway', async () => {
    mockUser.value = { id: 2, firstName: 'Mcebisi', lastName: 'N', role: 'warehouse_worker' };
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('button', { name: 'Rice' }));
    const panel = within(await screen.findByRole('dialog'));

    // The history stays readable; only Adjust is gated.
    await waitFor(() => expect(getMovements).toHaveBeenCalledWith(7));
    expect(panel.queryByRole('button', { name: /Adjust stock/ })).not.toBeInTheDocument();
  });
});

describe('InventoryManagementPage — adjusting', () => {
  it('POSTs an adjustment and re-reads the manifest from the server', async () => {
    const user = userEvent.setup();
    adjustStock.mockResolvedValue({ before: 100, after: 88, isShortfall: false });
    render(<InventoryManagementPage />);

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '12');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(modal.getByRole('button', { name: /Save adjustment/ }));

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
    await user.click(modal.getByRole('button', { name: /Save adjustment/ }));

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
    await user.click(modal.getByRole('button', { name: /Save adjustment/ }));

    await waitFor(() => expect(adjustStock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Spillage: Pallet dropped at bay 3' })
    ));
  });
});

describe('InventoryManagementPage — view tabs', () => {
  it('opens on the Low stock tab from ?status=lowstock, the link the dashboard and notification use', async () => {
    router.params = new URLSearchParams('status=lowstock');
    getManifest.mockResolvedValue([RICE, BEANS, LENTILS]);
    render(<InventoryManagementPage />);

    expect(await screen.findByRole('tab', { name: /Low stock/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'Sugar beans' })).toBeInTheDocument();
    // A shortfall is not also listed as low stock.
    expect(screen.queryByRole('button', { name: 'Red lentils' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rice' })).not.toBeInTheDocument();
  });

  it('counts each view on its tab', async () => {
    getManifest.mockResolvedValue([RICE, BEANS, LENTILS]);
    render(<InventoryManagementPage />);

    expect(await screen.findByRole('tab', { name: 'All 3' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Low stock 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shortfall 1' })).toBeInTheDocument();
  });

  it('writes the chosen tab to the URL', async () => {
    const user = userEvent.setup();
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('tab', { name: /Shortfall/ }));
    expect(router.setParams).toHaveBeenCalledWith({ status: 'shortfall' }, { replace: true });
  });
});

describe('InventoryManagementPage — bulk actions', () => {
  it('swaps the toolbar for the bulk bar once a row is ticked', async () => {
    const user = userEvent.setup();
    getManifest.mockResolvedValue([RICE, BEANS]);
    render(<InventoryManagementPage />);

    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Rice' }));

    expect(screen.getByText('1 product selected')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear selection/ }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('sends the ticked products to a new purchase order', async () => {
    const user = userEvent.setup();
    getManifest.mockResolvedValue([RICE, BEANS]);
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Rice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Sugar beans' }));
    await user.click(screen.getByRole('button', { name: /Raise purchase order/ }));

    expect(router.navigate).toHaveBeenCalledWith('/noc/purchase-orders?products=7,8');
  });

  it('exports only the ticked products', async () => {
    const user = userEvent.setup();
    getManifest.mockResolvedValue([RICE, BEANS]);
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Sugar beans' }));
    await user.click(screen.getByRole('button', { name: /Export selected/ }));

    const [rows] = toCsv.mock.calls[0];
    expect(rows.map((r) => r.name)).toEqual(['Sugar beans']);
    expect(downloadCsv).toHaveBeenCalledWith(expect.stringMatching(/^inventory-selected-/), 'csv');
  });

  it('walks through each ticked product in turn, one reason per product', async () => {
    const user = userEvent.setup();
    getManifest.mockResolvedValue([RICE, BEANS]);
    render(<InventoryManagementPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Rice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Sugar beans' }));
    const bulkBar = within(screen.getByRole('toolbar', { name: /Actions for selected products/ }));
    await user.click(bulkBar.getByRole('button', { name: /Adjust stock/ }));

    const first = within(await screen.findByRole('dialog', { name: /Adjust stock · Rice/ }));
    expect(first.getByText(/Product 1 of 2/)).toBeInTheDocument();
    await user.click(first.getByRole('button', { name: 'Skip' }));

    const second = within(await screen.findByRole('dialog', { name: /Adjust stock · Sugar beans/ }));
    expect(second.getByText(/Product 2 of 2/)).toBeInTheDocument();
    await user.click(second.getByRole('button', { name: 'Stop adjusting' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adjustStock).not.toHaveBeenCalled();
  });
});

describe('InventoryManagementPage — adjusting from the header', () => {
  it('asks which product, then opens its adjustment', async () => {
    const user = userEvent.setup();
    getManifest.mockResolvedValue([RICE, BEANS]);
    render(<InventoryManagementPage />);

    await screen.findByRole('button', { name: 'Rice' });
    await user.click(screen.getAllByRole('button', { name: /Adjust stock/ })[0]);
    const picker = within(await screen.findByRole('dialog', { name: 'Adjust stock' }));
    await user.type(picker.getByRole('searchbox', { name: 'Search by product or SKU' }), 'bea');
    await user.click(picker.getByRole('button', { name: /Sugar beans/ }));

    expect(await screen.findByRole('dialog', { name: /Adjust stock · Sugar beans/ })).toBeInTheDocument();
  });

  it('is not offered to a role that cannot adjust', async () => {
    mockUser.value = { id: 2, firstName: 'Mcebisi', lastName: 'N', role: 'warehouse_worker' };
    render(<InventoryManagementPage />);
    await screen.findByRole('button', { name: 'Rice' });
    expect(screen.queryByRole('button', { name: /Adjust stock/ })).not.toBeInTheDocument();
  });
});
