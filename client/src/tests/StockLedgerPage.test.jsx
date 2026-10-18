// ─────────────────────────────────────────────────────────────
// StockLedgerPage.test.jsx
//
// The page's wiring: does it ask the API for what the tabs and the
// toolbar say, and does it render what comes back — including the
// reference a movement links to.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const api = {
  getLedger:        vi.fn(),
  getReconciliation: vi.fn(),
  getLedgerActors:  vi.fn(),
  getManifest:      vi.fn(),
};

vi.mock('../services/stockAPI', () => api);

const { default: StockLedgerPage } = await import('../pages/StockLedgerPage');

const MOVEMENT = {
  id: 7,
  productId: 3,
  productName: 'Maize Meal',
  sku: 'MAIZE-5',
  quantity: -5,
  balanceAfter: 55,
  unit: 'kg',
  movementType: 'wastage',
  referenceType: 'manual_adjustment',
  referenceId: null,
  reason: 'Damaged / spoiled',
  performedByName: 'Alessio',
  createdAt: '2026-09-09T21:30:00.000Z',
};

const SUMMARY = {
  totalIn: 510, totalOut: -35, netChange: 475,
  movementCount: 7, productCount: 3,
};

const renderPage = (url = '/noc/stock-ledger') =>
  render(<MemoryRouter initialEntries={[url]}><StockLedgerPage /></MemoryRouter>);

beforeEach(() => {
  // StatTile counts up from 0 unless reduced motion is on.
  window.matchMedia = (query) => ({
    matches: query.includes('reduce'), media: query,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
  });
  vi.clearAllMocks();
  api.getLedger.mockResolvedValue({ movements: [MOVEMENT], summary: SUMMARY, nextCursor: null });
  api.getReconciliation.mockResolvedValue({ products: [], variances: [] });
  api.getLedgerActors.mockResolvedValue([{ id: 2, name: 'Alessio' }]);
  api.getManifest.mockResolvedValue([{ id: 3, name: 'Maize Meal' }]);
});

// "Has the page loaded" is asserted on the reason, which only the row
// carries.
const rowLoaded = () => screen.findByText('Damaged / spoiled');

describe('StockLedgerPage', () => {
  it('renders a movement row with its running balance', async () => {
    renderPage();
    await rowLoaded();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Maize Meal')).toBeInTheDocument();
    expect(table.getByText('55')).toBeInTheDocument();
  });

  it('sums the selection up in one line, out as a signed figure', async () => {
    renderPage();
    // One line in place of the four tiles; -35 in the ledger reads
    // "Out −35", the sign carried once.
    expect(await screen.findByText('−35')).toBeInTheDocument();
    expect(screen.getByText('+510')).toBeInTheDocument();
    expect(screen.getByText(/7 movements across 3 products/)).toBeInTheDocument();
  });

  it('defaults to the last 30 days', async () => {
    renderPage();
    await waitFor(() => expect(api.getLedger).toHaveBeenCalled());
    const args = api.getLedger.mock.calls[0][0];
    expect(args.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.movementTypes).toEqual([]);
  });

  it('refetches with the movement types of the tab chosen', async () => {
    renderPage();
    await rowLoaded();

    await userEvent.click(screen.getByRole('tab', { name: 'Wastage' }));

    await waitFor(() => {
      const last = api.getLedger.mock.calls.at(-1)[0];
      expect(last.movementTypes).toEqual(['wastage']);
    });
  });

  it('puts received and donated stock together under Stock in', async () => {
    renderPage('/noc/stock-ledger?status=in');
    await waitFor(() => expect(api.getLedger).toHaveBeenCalled());
    expect(api.getLedger.mock.calls.at(-1)[0].movementTypes).toEqual(['received', 'donated']);
  });

  it('drops the date filter entirely when the period is All time', async () => {
    renderPage();
    await rowLoaded();

    await userEvent.click(screen.getByRole('combobox', { name: 'Period' }));
    await userEvent.click(await screen.findByRole('option', { name: 'All time' }));

    await waitFor(() => {
      expect(api.getLedger.mock.calls.at(-1)[0].from).toBeNull();
    });
    // A period away from the default shows as a chip that undoes it.
    expect(screen.getByRole('button', { name: 'Remove filter: All time' })).toBeInTheDocument();
  });

  it('links a dispatch to its slip and a receipt to its order', async () => {
    api.getLedger.mockResolvedValue({
      movements: [
        { ...MOVEMENT, id: 8, movementType: 'dispatched', referenceType: 'dispatch_event', reason: null,
          pickingSlipId: 41, pickingSlipName: 'Sunshine ECD' },
        { ...MOVEMENT, id: 9, movementType: 'received', referenceType: 'delivery_note', reason: null,
          purchaseOrderId: 58, poNumber: 'PO-2026-0058' },
      ],
      summary: SUMMARY, nextCursor: null,
    });
    renderPage();

    expect(await screen.findByRole('link', { name: 'Slip · Sunshine ECD' })).toHaveAttribute('href', '/noc/picking-slips?open=41');
    expect(screen.getByRole('link', { name: 'PO-2026-0058' })).toHaveAttribute('href', '/noc/purchase-orders?id=58');
  });

  it('loads reconciliation only once its tab is opened', async () => {
    renderPage();
    await rowLoaded();
    expect(api.getReconciliation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: /Reconciliation/ }));

    await waitFor(() => expect(api.getReconciliation).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Every balance matches its ledger/i)).toBeInTheDocument();
  });

  it('names the products that do not balance', async () => {
    api.getReconciliation.mockResolvedValue({
      products: [{ id: 2, name: 'Tinned Pilchards', sku: 'FISH-400', unit: 'unit',
                   balance: 340, ledgerSum: 300, variance: 40, movementCount: 1 }],
      variances: [{ id: 2, name: 'Tinned Pilchards', sku: 'FISH-400', unit: 'unit',
                    balance: 340, ledgerSum: 300, variance: 40, movementCount: 1 }],
    });

    renderPage();
    await rowLoaded();
    await userEvent.click(screen.getByRole('tab', { name: /Reconciliation/ }));

    expect(await screen.findByText('Tinned Pilchards')).toBeInTheDocument();
    expect(screen.getByText(/1 product out of balance/i)).toBeInTheDocument();
  });

  it('surfaces a load failure without blanking the page', async () => {
    api.getLedger.mockRejectedValue(new Error('Ledger unavailable'));
    renderPage();
    expect(await screen.findByText('Ledger unavailable')).toBeInTheDocument();
    expect(screen.getByText('Stock ledger')).toBeInTheDocument();
  });
});
