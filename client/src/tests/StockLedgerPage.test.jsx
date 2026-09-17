// ─────────────────────────────────────────────────────────────
// StockLedgerPage.test.jsx
//
// The page's wiring: does it ask the API for what the filter bar
// says, and does it render what comes back.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const renderPage = () =>
  render(<MemoryRouter><StockLedgerPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getLedger.mockResolvedValue({ movements: [MOVEMENT], summary: SUMMARY, nextCursor: null });
  api.getReconciliation.mockResolvedValue({ products: [], variances: [] });
  api.getLedgerActors.mockResolvedValue([{ id: 2, name: 'Alessio' }]);
  api.getManifest.mockResolvedValue([{ id: 3, name: 'Maize Meal' }]);
});

// The product name appears twice on screen — once in the filter
// dropdown, once in the table — so "has the page loaded" is asserted
// on the reason cell, which only the row has. A bare
// getByText('Maize Meal') matches both and throws.
const rowLoaded = () => screen.findByText('Damaged / spoiled');

describe('StockLedgerPage', () => {
  it('renders a movement row with its running balance', async () => {
    renderPage();
    await rowLoaded();
    expect(screen.getByRole('cell', { name: 'Maize Meal' })).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
  });

  it('shows stock out as a positive magnitude, not a minus figure', async () => {
    renderPage();
    // -35 in the ledger is 35 units of stock leaving; showing "-35"
    // under a label that already says "out" reads as a double negative.
    expect(await screen.findByText('35')).toBeInTheDocument();
  });

  it('defaults to the last 30 days', async () => {
    renderPage();
    await waitFor(() => expect(api.getLedger).toHaveBeenCalled());
    const args = api.getLedger.mock.calls[0][0];
    expect(args.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.movementTypes).toEqual([]);
  });

  it('refetches with the type filter when a chip is pressed', async () => {
    renderPage();
    await rowLoaded();

    await userEvent.click(screen.getByRole('button', { name: 'Wastage' }));

    await waitFor(() => {
      const last = api.getLedger.mock.calls.at(-1)[0];
      expect(last.movementTypes).toEqual(['wastage']);
    });
  });

  it('drops the date filter entirely when the period is All time', async () => {
    renderPage();
    await rowLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/Period/i), 'all');

    await waitFor(() => {
      expect(api.getLedger.mock.calls.at(-1)[0].from).toBeNull();
    });
  });

  it('loads reconciliation only once its tab is opened', async () => {
    renderPage();
    await rowLoaded();
    expect(api.getReconciliation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Reconciliation' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Reconciliation' }));

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
