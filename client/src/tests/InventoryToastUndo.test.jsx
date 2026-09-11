// ──────────────────────────────────────────────────────────
// InventoryToastUndo.test.jsx
//
// The toast primitive, and the undo path on top of it.
//
// The invariant worth pinning: undo posts the INVERSE delta as a new
// movement. It never asks the server to delete the original. The
// reconciliation screen balances stock_levels against the sum of
// stock_movements, so a ledger anyone can quietly edit is not a
// ledger — and the reason is prefixed rather than reused so an undone
// wastage entry does not itself file as wastage.
// ──────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/stockAPI', () => ({
  getManifest:    vi.fn(),
  getMovements:   vi.fn(),
  adjustStock:    vi.fn(),
  getStockTrends: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, firstName: 'Alessio', lastName: 'M', role: 'manager' }, logout: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { getManifest, getMovements, adjustStock, getStockTrends } = await import('../services/stockAPI');
const { ToastProvider } = await import('../components/ui/toast');
const { useToast } = await import('../components/ui/toastContext');
const { default: InventoryManagementPage } = await import('../pages/InventoryManagementPage');

const MAIZE = {
  id: 3, name: 'Maize Meal', sku: 'MAIZE-5', unit: 'kg',
  onHand: 55, committed: 0, available: 55, reorderAt: 10,
  isShortfall: false, isLowStock: false,
};

const renderPage = () =>
  render(<ToastProvider><InventoryManagementPage /></ToastProvider>);

async function openAdjustModal(user) {
  await user.click(await screen.findByRole('button', { name: /Adjust/ }));
  return within(await screen.findByRole('dialog'));
}

beforeEach(() => {
  vi.clearAllMocks();
  getManifest.mockResolvedValue([MAIZE]);
  getMovements.mockResolvedValue([]);
  getStockTrends.mockResolvedValue({ 3: [60, 58, 55] });
  adjustStock.mockResolvedValue({ before: 60, after: 48, isShortfall: false });
});

// ── The primitive ───────────────────────────────────────
function Raiser({ options }) {
  const toast = useToast();
  return <button type="button" onClick={() => toast(options)}>raise</button>;
}

describe('toast primitive', () => {
  it('shows a toast and its description', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Raiser options={{ title: 'Saved', description: 'All good' }} /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'raise' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('runs the action and dismisses the toast when it is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Raiser options={{ title: 'Removed 5 kg', action: { label: 'Undo', onClick } }} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'raise' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Removed 5 kg')).not.toBeInTheDocument());
  });

  it('uses role=alert for errors so they are announced immediately', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Raiser options={{ title: 'Nope', variant: 'error' }} /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'raise' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });

  it('is a no-op outside a provider rather than throwing', async () => {
    const user = userEvent.setup();
    render(<Raiser options={{ title: 'Orphan' }} />);

    await user.click(screen.getByRole('button', { name: 'raise' }));
    expect(screen.queryByText('Orphan')).not.toBeInTheDocument();
  });
});

// ── The page ───────────────────────────────────────────
describe('inventory adjustments — toast and undo', () => {
  it('loads the 30 day sparkline series alongside the manifest', async () => {
    renderPage();
    await waitFor(() => expect(getStockTrends).toHaveBeenCalledWith(30));
  });

  it('still renders the manifest when the trend fetch fails', async () => {
    getStockTrends.mockRejectedValue(new Error('trends unavailable'));
    renderPage();
    expect(await screen.findAllByText('Maize Meal')).not.toHaveLength(0);
  });

  it('offers Undo after a successful adjustment', async () => {
    const user = userEvent.setup();
    renderPage();

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '12');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('posts the inverse delta on undo, and never asks the server to delete', async () => {
    const user = userEvent.setup();
    renderPage();

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '12');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(adjustStock).toHaveBeenLastCalledWith({
      productId: 3,
      quantityDelta: 12,                      // the inverse of -12
      unit: 'kg',
      reason: 'Undo of: Damaged / spoiled',   // prefixed, so it files as an adjustment
    }));
    expect(adjustStock).toHaveBeenCalledTimes(2);
  });

  it('reports a save failure through the toast, not window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    adjustStock.mockRejectedValue(new Error('A reason is required for manual adjustments.'));

    const user = userEvent.setup();
    renderPage();

    const modal = await openAdjustModal(user);
    await user.type(modal.getByLabelText(/Quantity/), '5');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Spillage');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save that adjustment/i);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
