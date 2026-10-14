// ─────────────────────────────────────────────────────────────
// src/tests/ReceivingOrderSearch.test.jsx
//
// Three things worth pinning:
//
//   1  Guided's order step holds EVERY open order, not one supplier's.
//      A worker with an order number off a driver's note has to be
//      able to find it without first guessing which supplier the
//      system files it under — and picking it that way has to set the
//      supplier, because the submit payload carries both and the
//      server rejects a mismatch. That last part fails silently on
//      the client and only shows up as a 400 at the end of a
//      delivery, which is the worst possible moment.
//
//   2  Form's order step is the opposite on purpose: scoped to
//      whichever supplier was picked just above it, and empty until
//      one is — an order dropdown that still mixed every supplier's
//      work in after a supplier was chosen would let the wrong line
//      be picked with nothing stopping it.
//
//   3  A delivery cannot be finished until every line is ticked.
//
// Both order pickers are a dropdown now (role "combobox"), not the
// stacked tap-target list ("radio") the whole screen used to render
// regardless of mode — see ReceivingFlow.jsx's own note on why.
//
// The API, auth and the PDF pop-up are mocked; the flow is real.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../features/receiving/DeliveryNotePDF', () => ({ default: () => null }));

const receivingAPI = (await import('../services/receivingAPI')).default;
const { default: ReceivingFlow } = await import('../features/receiving/ReceivingFlow');

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

const setMode = (mode) => {
  try { localStorage.setItem('stf_receiving_view_mode', mode); } catch { /* ignore */ }
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* private window */ }
  receivingAPI.getSuppliers.mockResolvedValue(SUPPLIERS);
  receivingAPI.getSuppliersWithOpenOrders.mockResolvedValue(SUPPLIERS);
  receivingAPI.getPurchaseOrders.mockResolvedValue(ORDERS);
  receivingAPI.getPurchaseOrderItems.mockResolvedValue(ITEMS);
});

// Guided: order 86 found straight off its number, no supplier chosen
// first — the cross-supplier path this describe block is about.
const openOrder86Guided = async (user) => {
  setMode('guided');
  render(<ReceivingFlow />);
  const orderSelect = await screen.findByRole('combobox', { name: /Which order/i });
  await user.selectOptions(orderSelect, '86');
  await user.click(screen.getByRole('button', { name: 'Start counting' }));
  await screen.findByText('Apples (Bulk Bag)');
};

// Form: supplier picked first (order 86 belongs to Cape Cold Storage),
// which is what scopes the order dropdown to it in the first place.
const openOrder86Form = async (user) => {
  setMode('full');
  render(<ReceivingFlow />);
  const supplierSelect = await screen.findByRole('combobox', { name: /Who it came from/i });
  await user.selectOptions(supplierSelect, '2');
  const orderSelect = await screen.findByRole('combobox', { name: /Which order/i });
  await user.selectOptions(orderSelect, '86');
  await user.click(screen.getByRole('button', { name: 'Start counting' }));
  await screen.findByText('Apples (Bulk Bag)');
};

describe('receiving: Guided\'s order list (cross-supplier)', () => {
  it('asks for every open order, with no supplier', async () => {
    setMode('guided');
    render(<ReceivingFlow />);
    await waitFor(() => expect(receivingAPI.getPurchaseOrders).toHaveBeenCalled());
    // No argument at all — receivingAPI turns that into a request with
    // no supplierId rather than the string "undefined".
    expect(receivingAPI.getPurchaseOrders).toHaveBeenCalledWith();
  });

  it('shows orders from every supplier before one is picked', async () => {
    setMode('guided');
    render(<ReceivingFlow />);
    const select = await screen.findByRole('combobox', { name: /Which order/i });
    expect(within(select).getByRole('option', { name: /PO-0074/ })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: /PO-0086/ })).toBeInTheDocument();
  });

  it('names the supplier on each order, since the list spans suppliers', async () => {
    setMode('guided');
    render(<ReceivingFlow />);
    const select = await screen.findByRole('combobox', { name: /Which order/i });
    expect(within(select).getByRole('option', { name: /Cape Cold Storage/ })).toBeInTheDocument();
  });

  it('finds an order by its number', async () => {
    setMode('guided');
    const user = userEvent.setup();
    render(<ReceivingFlow />);
    const select = await screen.findByRole('combobox', { name: /Which order/i });
    within(select).getByRole('option', { name: /PO-0074/ });

    await user.click(screen.getByRole('button', { name: 'Search orders' }));
    await user.type(screen.getByLabelText(/Search by order number/), '86');
    expect(within(select).getByRole('option', { name: /PO-0086/ })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /PO-0074/ })).not.toBeInTheDocument();
  });

  it('finds an order by the date on the note, written the way a person writes it', async () => {
    setMode('guided');
    const user = userEvent.setup();
    render(<ReceivingFlow />);
    const select = await screen.findByRole('combobox', { name: /Which order/i });
    within(select).getByRole('option', { name: /PO-0074/ });

    await user.click(screen.getByRole('button', { name: 'Search orders' }));
    await user.type(screen.getByLabelText(/Search by order number/), '16 august');
    expect(within(select).getByRole('option', { name: /PO-0074/ })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /PO-0086/ })).not.toBeInTheDocument();
  });

  it('picking an order sets its supplier, so the payload is not half-empty', async () => {
    const user = userEvent.setup();
    await openOrder86Guided(user);
    // The work screen's heading is the supplier's name. Nobody picked
    // Cape Cold Storage — selecting order 86 did.
    expect(screen.getByRole('heading', { name: /Cape Cold Storage/ })).toBeInTheDocument();
  });
});

describe('receiving: Guided and Form choose a delivery the same way', () => {
  // The two views differ in how lines are counted, not in which
  // delivery can be chosen. They used to list different suppliers and
  // different orders, so the same order could be found in one view and
  // not the other.
  const optionsOf = (select) => within(select).getAllByRole('option').map((o) => o.textContent);

  it('lists the same suppliers and the same orders in both views', async () => {
    const seen = {};
    for (const mode of ['guided', 'full']) {
      setMode(mode);
      const { unmount } = render(<ReceivingFlow />);
      seen[mode] = {
        suppliers: optionsOf(await screen.findByRole('combobox', { name: /Who it came from/i })),
        orders:    optionsOf(await screen.findByRole('combobox', { name: /Which order/i })),
      };
      unmount();
    }
    expect(seen.full).toEqual(seen.guided);
    expect(seen.guided.suppliers).toEqual(
      expect.arrayContaining(['Bokomo Foods Distribution', 'Cape Cold Storage']));
    expect(seen.guided.orders).toHaveLength(3); // the placeholder and both orders
  });

  it('only lists suppliers that have an order to receive', async () => {
    receivingAPI.getPurchaseOrders.mockResolvedValue([ORDERS[1]]);
    setMode('guided');
    render(<ReceivingFlow />);
    const select = await screen.findByRole('combobox', { name: /Who it came from/i });
    expect(within(select).getByRole('option', { name: 'Cape Cold Storage' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Bokomo Foods Distribution' })).not.toBeInTheDocument();
  });

  it('only offers the chosen supplier\'s own orders', async () => {
    setMode('full');
    const user = userEvent.setup();
    render(<ReceivingFlow />);
    const supplierSelect = await screen.findByRole('combobox', { name: /Who it came from/i });
    await user.selectOptions(supplierSelect, '2'); // Cape Cold Storage — owns order 86, not 74

    const orderSelect = await screen.findByRole('combobox', { name: /Which order/i });
    expect(within(orderSelect).getByRole('option', { name: /PO-0086/ })).toBeInTheDocument();
    expect(within(orderSelect).queryByRole('option', { name: /PO-0074/ })).not.toBeInTheDocument();
  });

  it('reaches the same work screen order 86 does in Guided', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);
    expect(screen.getByRole('heading', { name: /Cape Cold Storage/ })).toBeInTheDocument();
  });
});

describe('receiving: every line has to be ticked', () => {
  it('says how many ticks are outstanding', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    expect(screen.getByRole('button', { name: 'Finish this delivery' })).toBeDisabled();
    expect(screen.getByText(/a tick on 2 more lines/)).toBeInTheDocument();
  });

  it('counts down as lines are ticked, and says line not lines at one', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    await user.click(screen.getByRole('button', { name: 'Confirm Apples (Bulk Bag)' }));
    expect(await screen.findByText(/a tick on 1 more line\b/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Canned Baked Beans 410g' }));
    await waitFor(() =>
      expect(screen.queryByText(/a tick on \d+ more/)).not.toBeInTheDocument());
  });

  it('"everything as ordered" ticks the lot, so the clean case is one press', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    await user.click(screen.getByRole('button', { name: /Everything as ordered/ }));
    await waitFor(() =>
      expect(screen.queryByText(/a tick on \d+ more/)).not.toBeInTheDocument());
  });

  it('still wants a signature after the ticks — the rule is additive', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    await user.click(screen.getByRole('button', { name: /Everything as ordered/ }));
    await waitFor(() => expect(screen.getByText(/driver's signature/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Finish this delivery' })).toBeDisabled();
  });
});

describe('receiving: what Form used to leave out', () => {
  it('has the use-by date for a fresh line', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    // Apples is fresh and has no date yet, so it is the one asked about.
    expect(screen.getByText(/a use-by date on Apples/)).toBeInTheDocument();
    const useBy = document.getElementById('stf-useby-501');
    await user.type(useBy, '2026-11-01');
    await waitFor(() =>
      expect(screen.queryByText(/a use-by date on/)).not.toBeInTheDocument());
  });

  // Asked for from the floor: Form showed no date on a dry line, so it
  // looked as though Form did not collect expiry dates at all. Every
  // line has the box now; on a dry line it may be left empty.
  it('asks for the date on a dry line too, without requiring it', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    expect(screen.getAllByLabelText(/What is the date on the box/i)).toHaveLength(2);
    expect(document.getElementById('stf-useby-502')).toBeInTheDocument();
    expect(screen.getByText('Leave it empty if there is no date.')).toBeInTheDocument();
    expect(screen.queryByText(/a use-by date on Canned Baked Beans/)).not.toBeInTheDocument();
  });

  it('shows where each line is going without a tap', async () => {
    const user = userEvent.setup();
    await openOrder86Form(user);

    // Form is every line at once: the storage place is on screen for
    // both lines, not behind a row that has to be opened first.
    expect(screen.getByText(/Where the Apples \(Bulk Bag\) is going/)).toBeInTheDocument();
    expect(screen.getByText(/Where the Canned Baked Beans 410g is going/)).toBeInTheDocument();
  });

  it('shows the order number the manager sees, and finds the order by it', async () => {
    receivingAPI.getPurchaseOrders.mockResolvedValue(
      ORDERS.map((o) => ({ ...o, po_number: `PO-2026-00${o.id}` })),
    );
    setMode('guided');
    const user = userEvent.setup();
    render(<ReceivingFlow />);
    const select = await screen.findByRole('combobox', { name: /Which order/i });
    expect(within(select).getByRole('option', { name: /PO-2026-0086/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search orders' }));
    await user.type(screen.getByLabelText(/Search by order number/), 'PO-2026-0074');
    expect(within(select).queryByRole('option', { name: /PO-2026-0086/ })).not.toBeInTheDocument();
  });

  it('names an order still waiting for approval', async () => {
    receivingAPI.getOrdersAwaitingApproval = vi.fn().mockResolvedValue([
      { id: 90, po_number: 'PO-2026-0090', supplier_name: 'Bokomo Foods Distribution' },
    ]);
    setMode('guided');
    render(<ReceivingFlow />);
    expect(await screen.findByText(/Waiting for a manager to approve: PO-2026-0090/)).toBeInTheDocument();
  });
});
