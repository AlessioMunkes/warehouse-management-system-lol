// ─────────────────────────────────────────────────────────────
// client/src/tests/StepBackReceiving.test.jsx
//
// Receiving's step back: on the counting screen the shell offers
// "‹ Choose a delivery", which goes back to the order list without
// losing what was counted or ticked. The arrow at the top left is not
// touched (the shell is stubbed here to expose only onBack/backLabel).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/receivingAPI', () => ({
  default: {
    getSuppliers: vi.fn(),
    getSuppliersWithOpenOrders: vi.fn(),
    getPurchaseOrders: vi.fn(),
    getPurchaseOrderItems: vi.fn(),
    recordDelivery: vi.fn(),
    getDeliveryById: vi.fn(),
    getProducts: vi.fn(),
  },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  newIdempotencyKey: () => 'test-key',
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, firstName: 'Mcebisi', lastName: 'Ndlovu', role: 'warehouse_worker' } }),
}));
vi.mock('../features/procurement/components/DeliveryNotePDF', () => ({ default: () => null }));
// The real pad is a canvas. This one signs when pressed.
vi.mock('../features/procurement/components/SignaturePad', () => ({
  default: ({ onChange }) => <button type="button" onClick={() => onChange('data:image/png;base64,sig')}>Sign</button>,
}));
// Only what the page hands the shell: the crumb and the step back.
vi.mock('../components/layout/StaffShell', () => ({
  default: ({ children, crumb, onBack, backLabel }) => (
    <div>
      <p data-testid="crumb">{crumb}</p>
      {onBack ? <button type="button" onClick={onBack}>{`‹ ${backLabel}`}</button> : null}
      {children}
    </div>
  ),
}));

const receivingAPI = (await import('../services/receivingAPI')).default;
const { default: ReceivingPage } = await import('../pages/ReceivingPage');

const SUPPLIERS = [{ id: 2, name: 'Cape Cold Storage' }];
const ORDERS = [
  { id: 86, supplier_id: 2, supplier_name: 'Cape Cold Storage', status: 'pending', expected_delivery_date: '2026-09-02' },
];
const ITEMS = [
  { purchase_order_item_id: 501, product_id: 11, product_name: 'Apples (Bulk Bag)', sku: 'APPLES', expected_quantity: 47, expected_weight_kg: null, is_perishable: false },
  { purchase_order_item_id: 502, product_id: 12, product_name: 'Canned Baked Beans 410g', sku: 'BEANS', expected_quantity: 45, expected_weight_kg: null, is_perishable: false },
];

const BACK = '‹ Choose a delivery';

const renderPage = () => render(<MemoryRouter><ReceivingPage /></MemoryRouter>);

// Form view: pick the supplier, then the order, then start counting.
const startCountingOrder86 = async (user) => {
  const supplier = await screen.findByRole('combobox', { name: /Who it came from/i });
  await user.selectOptions(supplier, '2');
  const order = await screen.findByRole('combobox', { name: /Which order/i });
  await user.selectOptions(order, '86');
  await user.click(screen.getByRole('button', { name: 'Start counting' }));
  await screen.findByText('Apples (Bulk Bag)');
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); localStorage.setItem('stf_receiving_view_mode', 'full'); } catch { /* ignore */ }
  receivingAPI.getSuppliers.mockResolvedValue(SUPPLIERS);
  receivingAPI.getSuppliersWithOpenOrders.mockResolvedValue(SUPPLIERS);
  receivingAPI.getPurchaseOrders.mockResolvedValue(ORDERS);
  receivingAPI.getPurchaseOrderItems.mockResolvedValue(ITEMS);
});

describe('Receiving: the step back', () => {
  it('is not there on the first screen, and appears while counting', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('combobox', { name: /Who it came from/i });
    expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument();

    await startCountingOrder86(user);
    expect(screen.getByRole('button', { name: BACK })).toBeInTheDocument();
  });

  it('goes back to choosing the delivery, and the crumb follows', async () => {
    const user = userEvent.setup();
    renderPage();
    await startCountingOrder86(user);
    expect(screen.getByTestId('crumb')).toHaveTextContent('Count and put away');

    await user.click(screen.getByRole('button', { name: BACK }));
    expect(await screen.findByRole('combobox', { name: /Which order/i })).toBeInTheDocument();
    expect(screen.getByTestId('crumb')).toHaveTextContent('Which delivery');
    expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument();
  });

  it('keeps the ticks and the counts when you go back and start counting again', async () => {
    const user = userEvent.setup();
    renderPage();
    await startCountingOrder86(user);

    await user.click(screen.getByRole('button', { name: 'Confirm Apples (Bulk Bag)' }));
    await user.click(screen.getAllByRole('button', { name: /One fewer/ })[0]);
    expect(await screen.findByText(/a tick on 1 more line\b/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('46')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: BACK }));
    await user.click(await screen.findByRole('button', { name: 'Start counting' }));

    expect(await screen.findByText(/a tick on 1 more line\b/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('46')).toBeInTheDocument();
    // Picked straight back up, not fetched and rebuilt.
    expect(receivingAPI.getPurchaseOrderItems).toHaveBeenCalledTimes(1);
  });

  it('keeps the counts in the saved draft too, so a fresh start finds them', async () => {
    const user = userEvent.setup();
    renderPage();
    await startCountingOrder86(user);
    await user.click(screen.getAllByRole('button', { name: /One fewer/ })[0]);
    await screen.findByDisplayValue('46');

    await user.click(screen.getByRole('button', { name: BACK }));
    cleanup();

    renderPage();
    await startCountingOrder86(user);
    expect(await screen.findByDisplayValue('46')).toBeInTheDocument();
  });

  it('is not offered while the delivery is being saved, and comes back if the save fails', async () => {
    const user = userEvent.setup();
    let fail;
    receivingAPI.recordDelivery.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    renderPage();
    await startCountingOrder86(user);
    await user.click(screen.getByRole('button', { name: /Everything as ordered/ }));
    await user.click(screen.getByRole('button', { name: 'Sign' }));
    await user.click(screen.getByRole('button', { name: 'Finish this delivery' }));

    await waitFor(() => expect(receivingAPI.recordDelivery).toHaveBeenCalledTimes(1));
    // Saving: no way to step away from a request in flight.
    await waitFor(() => expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument());

    fail(new Error('Network down'));
    expect(await screen.findByRole('button', { name: BACK })).toBeInTheDocument();
  });
});
