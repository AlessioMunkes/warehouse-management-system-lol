// ─────────────────────────────────────────────────────────────
// src/tests/PurchaseOrdersPage.test.jsx
//
// Purchase orders on the shared list pattern: the tabs (and the
// ?status= links the dashboard uses), the "n of m received" column,
// and the panel's status actions — Approve, Record follow-up (which
// needs a reason) and Reopen.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/purchaseOrderAPI', async () => {
  const actual = await vi.importActual('../services/purchaseOrderAPI');
  const api = {
    getPurchaseOrders: vi.fn(),
    getPurchaseOrder: vi.fn(),
    setPurchaseOrderStatus: vi.fn(),
    createPurchaseOrder: vi.fn(),
    updatePurchaseOrder: vi.fn(),
    deletePurchaseOrder: vi.fn(),
    setQuickbooksReference: vi.fn(),
  };
  return { ...actual, ...api, default: api };
});
vi.mock('../services/supplierAPI', () => ({ default: { getSuppliers: vi.fn(async () => []) } }));
vi.mock('../services/stockAPI', () => ({ default: { getManifest: vi.fn(async () => []) } }));
vi.mock('../components/layout/ManagerLayout', () => ({ default: ({ children }) => children }));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'manager' } }) }));

const router = { params: new URLSearchParams(), setParams: vi.fn() };
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [router.params, router.setParams],
}));

const { default: api } = await import('../services/purchaseOrderAPI');
const { default: PurchaseOrdersPage } = await import('../pages/PurchaseOrdersPage');

const po = (over) => ({
  id: 1, poNumber: 'PO-2026-0001', supplierName: 'Fresh Co', status: 'pending', statusLabel: 'Pending approval',
  statusReason: '', expectedDeliveryDate: null, lineCount: 4, receivedLineCount: 0, estimatedValue: 100,
  receiptCount: 0, items: [], deliveries: [], quickbooksPoId: '', notes: '', ...over,
});

const ORDERS = [
  po({ id: 1, poNumber: 'PO-1' }),
  po({ id: 2, poNumber: 'PO-2', status: 'in_transit', statusLabel: 'In transit', receivedLineCount: 1 }),
  po({ id: 3, poNumber: 'PO-3', status: 'follow_up_required', statusLabel: 'Follow-up required', statusReason: 'Late' }),
  po({ id: 4, poNumber: 'PO-4', status: 'completed', statusLabel: 'Completed', receivedLineCount: 4 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  router.params = new URLSearchParams();
  api.getPurchaseOrders.mockResolvedValue(ORDERS);
  api.getPurchaseOrder.mockImplementation(async (id) => ORDERS.find((o) => o.id === Number(id)));
  api.setPurchaseOrderStatus.mockResolvedValue({});
});

describe('PurchaseOrdersPage', () => {
  it('asks for enough orders to count its tabs from', async () => {
    render(<PurchaseOrdersPage />);
    await waitFor(() => expect(api.getPurchaseOrders).toHaveBeenCalledWith({ limit: 500 }));
  });

  it('counts each tab; Open leaves out completed and returned orders', async () => {
    render(<PurchaseOrdersPage />);
    expect(await screen.findByRole('tab', { name: 'Open 3' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Awaiting approval 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Follow-up required 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All 4' })).toBeInTheDocument();
  });

  it('opens on the tab the dashboard links to', async () => {
    router.params = new URLSearchParams('status=follow_up_required');
    render(<PurchaseOrdersPage />);
    expect(await screen.findByText('PO-3')).toBeInTheDocument();
    expect(screen.queryByText('PO-1')).not.toBeInTheDocument();
  });

  it('shows how many lines have arrived', async () => {
    render(<PurchaseOrdersPage />);
    expect(await screen.findByText('1 of 4')).toBeInTheDocument();
  });

  it('records a follow-up only with a reason', async () => {
    const user = userEvent.setup();
    render(<PurchaseOrdersPage />);

    await user.click(await screen.findByText('PO-2'));
    const panel = within(await screen.findByRole('dialog', { name: 'PO-2' }));
    await user.click(panel.getByRole('button', { name: /Record follow-up/ }));

    const save = panel.getByRole('button', { name: 'Save follow-up' });
    expect(save).toBeDisabled();
    await user.type(panel.getByLabelText(/What needs following up/), 'Supplier not answering');
    await user.click(save);

    await waitFor(() => expect(api.setPurchaseOrderStatus).toHaveBeenCalledWith(2, 'follow_up_required', 'Supplier not answering'));
  });

  it('reopens a followed-up order for receiving', async () => {
    const user = userEvent.setup();
    router.params = new URLSearchParams('status=follow_up_required');
    render(<PurchaseOrdersPage />);

    await user.click(await screen.findByText('PO-3'));
    const panel = within(await screen.findByRole('dialog', { name: 'PO-3' }));
    expect(panel.getByText('Late')).toBeInTheDocument();
    await user.click(panel.getByRole('button', { name: /Reopen for receiving/ }));

    await waitFor(() => expect(api.setPurchaseOrderStatus).toHaveBeenCalledWith(3, 'approved', null));
  });

  it('approves a pending order', async () => {
    const user = userEvent.setup();
    render(<PurchaseOrdersPage />);

    await user.click(await screen.findByText('PO-1'));
    const panel = within(await screen.findByRole('dialog', { name: 'PO-1' }));
    await user.click(panel.getByRole('button', { name: /Approve/ }));

    await waitFor(() => expect(api.setPurchaseOrderStatus).toHaveBeenCalledWith(1, 'approved', null));
  });
});
