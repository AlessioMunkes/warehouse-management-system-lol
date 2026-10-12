// ─────────────────────────────────────────────────────────────
// src/tests/QuickbooksSync.test.jsx
//
// The QuickBooks line on a purchase order. It has to be invisible
// where QuickBooks is not connected, and where it is, say plainly what
// state the order is in and what a person can do about it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ getOrderState: vi.fn(), sendOrder: vi.fn() }));
vi.mock('../services/quickbooksAPI', () => api);

const { default: QuickbooksSync } = await import('../features/purchaseOrders/QuickbooksSync');

const PO = { id: 28, status: 'approved', quickbooksPoId: null };
const show = (po = PO, props = {}) => render(<QuickbooksSync purchaseOrder={po} canManage {...props} />);

beforeEach(() => vi.clearAllMocks());

describe('the QuickBooks line on an order', () => {
  it('is not there at all when QuickBooks is not connected', async () => {
    api.getOrderState.mockResolvedValue({ available: false });
    const { container } = show();
    await waitFor(() => expect(api.getOrderState).toHaveBeenCalledWith(28));
    expect(container).toBeEmptyDOMElement();
  });

  it('is not there if its status cannot be read', async () => {
    api.getOrderState.mockRejectedValue(new Error('down'));
    const { container } = show();
    await waitFor(() => expect(api.getOrderState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing more about an order that is already linked', async () => {
    api.getOrderState.mockResolvedValue({ available: true, state: 'synced', quickbooksPoId: 'PO-2026-0028' });
    const { container } = show({ ...PO, quickbooksPoId: 'PO-2026-0028' });
    await waitFor(() => expect(api.getOrderState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('offers nothing for an order nobody has approved yet', async () => {
    api.getOrderState.mockResolvedValue({ available: true, state: 'none' });
    const { container } = show({ ...PO, status: 'pending' });
    await waitFor(() => expect(api.getOrderState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to send an approved order that has not gone', async () => {
    api.getOrderState.mockResolvedValue({ available: true, state: 'none' });
    show();
    expect(await screen.findByText('Not sent to QuickBooks yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to QuickBooks' })).toBeInTheDocument();
  });

  it('names what was not found, and sends again once it is fixed', async () => {
    const onSynced = vi.fn();
    api.getOrderState.mockResolvedValue({
      available: true, state: 'needs_match',
      message: 'Not found in QuickBooks by name: supplier "Cape Dry Goods". Add it in QuickBooks with exactly the same name, then send this order again.',
    });
    api.sendOrder.mockResolvedValue({ available: true, state: 'synced', quickbooksPoId: 'PO-2026-0028' });
    show(PO, { onSynced });

    expect(await screen.findByText('Needs a match in QuickBooks')).toBeInTheDocument();
    expect(screen.getByText(/supplier "Cape Dry Goods"/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(onSynced).toHaveBeenCalledWith('PO-2026-0028'));
    expect(api.sendOrder).toHaveBeenCalledWith(28);
  });

  it('keeps saying why when a second try still does not match', async () => {
    api.getOrderState.mockResolvedValue({ available: true, state: 'needs_match', message: 'first' });
    api.sendOrder.mockResolvedValue({ available: true, state: 'needs_match', message: 'Not found in QuickBooks by name: product "Rice 2 kg".' });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send again' }));
    expect(await screen.findByText(/product "Rice 2 kg"/)).toBeInTheDocument();
  });

  it('shows the state but no button to someone who cannot manage orders', async () => {
    api.getOrderState.mockResolvedValue({ available: true, state: 'failed', message: 'QuickBooks is busy. Try again in a few minutes.' });
    show(PO, { canManage: false });
    expect(await screen.findByText('Could not be sent to QuickBooks')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
