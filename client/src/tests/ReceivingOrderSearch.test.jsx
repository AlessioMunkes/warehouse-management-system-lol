// ─────────────────────────────────────────────────────────────
// src/tests/ReceivingOrderSearch.test.jsx
//
// Two changes worth pinning:
//
//   1  Step 1 holds EVERY open order, not one supplier's. A worker
//      with an order number off a driver's note has to be able to
//      find it without first guessing which supplier the system
//      files it under — and picking it that way has to set the
//      supplier, because the submit payload carries both and the
//      server rejects a mismatch. That last part fails silently on
//      the client and only shows up as a 400 at the end of a
//      delivery, which is the worst possible moment.
//
//   2  A delivery cannot be finished until every line is ticked.
//
// The API, auth and the PDF pop-up are mocked; the flow is real.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const receivingAPI = (await import('../services/receivingAPI')).default;
const { default: ReceivingFlow } = await import('../features/procurement/components/ReceivingFlow');

const SUPPLIERS = [
  { id: 1, name: 'Bokomo Foods Distribution' },
  { id: 2, name: 'Cape Cold Storage' },
];

// Two suppliers, two orders. The test picks the one whose supplier is
// NOT selected, which is the case the old per-supplier fetch could
// not reach at all.
const ORDERS = [
  { id: 74, supplier_id: 1, supplier_name: 'Bokomo Foods Distribution', status: 'pending', expected_delivery_date: '2026-08-16' },
  { id: 86, supplier_id: 2, supplier_name: 'Cape Cold Storage', status: 'pending', expected_delivery_date: '2026-09-02' },
];

const ITEMS = [
  { purchase_order_item_id: 501, product_id: 11, product_name: 'Apples (Bulk Bag)', sku: 'APPLES-10KG-001', expected_quantity: 47, expected_weight_kg: null },
  { purchase_order_item_id: 502, product_id: 12, product_name: 'Canned Baked Beans 410g', sku: 'BEANS-410G-001', expected_quantity: 45, expected_weight_kg: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* private window */ }
  // Form mode: every line on screen at once, which is what the tick
  // rule is about. Guided is covered in StaffPolish.test.jsx.
  try { localStorage.setItem('stf_receiving_view_mode', 'full'); } catch { /* ignore */ }
  receivingAPI.getSuppliers.mockResolvedValue(SUPPLIERS);
  receivingAPI.getSuppliersWithOpenOrders.mockResolvedValue(SUPPLIERS);
  receivingAPI.getPurchaseOrders.mockResolvedValue(ORDERS);
  receivingAPI.getPurchaseOrderItems.mockResolvedValue(ITEMS);
});

const openOrder86 = async (user) => {
  render(<ReceivingFlow />);
  await screen.findByRole('radio', { name: /Order 86/ });
  await user.click(screen.getByRole('radio', { name: /Order 86/ }));
  await user.click(screen.getByRole('button', { name: 'Start counting' }));
  await screen.findByText('Apples (Bulk Bag)');
};

describe('receiving: the order list', () => {
  it('asks for every open order, with no supplier', async () => {
    render(<ReceivingFlow />);
    await waitFor(() => expect(receivingAPI.getPurchaseOrders).toHaveBeenCalled());
    // No argument at all — receivingAPI turns that into a request with
    // no supplierId rather than the string "undefined".
    expect(receivingAPI.getPurchaseOrders).toHaveBeenCalledWith();
  });

  it('shows orders from every supplier before one is picked', async () => {
    render(<ReceivingFlow />);
    expect(await screen.findByRole('radio', { name: /Order 74/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Order 86/ })).toBeInTheDocument();
  });

  it('names the supplier on each order, since the list spans suppliers', async () => {
    render(<ReceivingFlow />);
    expect(await screen.findByRole('radio', { name: /Cape Cold Storage/ })).toBeInTheDocument();
  });

  it('finds an order by its number', async () => {
    const user = userEvent.setup();
    render(<ReceivingFlow />);
    await screen.findByRole('radio', { name: /Order 74/ });

    await user.type(screen.getByLabelText(/Search by order number/), '86');
    expect(screen.getByRole('radio', { name: /Order 86/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Order 74/ })).not.toBeInTheDocument();
  });

  it('finds an order by the date on the note, written the way a person writes it', async () => {
    const user = userEvent.setup();
    render(<ReceivingFlow />);
    await screen.findByRole('radio', { name: /Order 74/ });

    await user.type(screen.getByLabelText(/Search by order number/), '16 august');
    expect(screen.getByRole('radio', { name: /Order 74/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Order 86/ })).not.toBeInTheDocument();
  });

  it('picking an order sets its supplier, so the payload is not half-empty', async () => {
    const user = userEvent.setup();
    await openOrder86(user);
    // The work screen's heading is the supplier's name. Nobody picked
    // Cape Cold Storage — selecting order 86 did.
    expect(screen.getByRole('heading', { name: /Cape Cold Storage/ })).toBeInTheDocument();
  });
});

describe('receiving: every line has to be ticked', () => {
  it('says how many ticks are outstanding', async () => {
    const user = userEvent.setup();
    await openOrder86(user);

    expect(screen.getByRole('button', { name: 'Finish this delivery' })).toBeDisabled();
    expect(screen.getByText(/a tick on 2 more lines/)).toBeInTheDocument();
  });

  it('counts down as lines are ticked, and says line not lines at one', async () => {
    const user = userEvent.setup();
    await openOrder86(user);

    await user.click(screen.getByRole('button', { name: 'Confirm Apples (Bulk Bag)' }));
    expect(await screen.findByText(/a tick on 1 more line\b/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Canned Baked Beans 410g' }));
    await waitFor(() =>
      expect(screen.queryByText(/a tick on \d+ more/)).not.toBeInTheDocument());
  });

  it('"everything as ordered" ticks the lot, so the clean case is one press', async () => {
    const user = userEvent.setup();
    await openOrder86(user);

    await user.click(screen.getByRole('button', { name: /Everything as ordered/ }));
    await waitFor(() =>
      expect(screen.queryByText(/a tick on \d+ more/)).not.toBeInTheDocument());
  });

  it('still wants a signature after the ticks — the rule is additive', async () => {
    const user = userEvent.setup();
    await openOrder86(user);

    await user.click(screen.getByRole('button', { name: /Everything as ordered/ }));
    await waitFor(() => expect(screen.getByText(/driver's signature/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Finish this delivery' })).toBeDisabled();
  });
});
