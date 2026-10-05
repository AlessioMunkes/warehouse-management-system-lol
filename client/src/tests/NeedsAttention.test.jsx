// ─────────────────────────────────────────────────────────────
// src/tests/NeedsAttention.test.jsx
//
// The dashboard's "Needs attention" list: one line per non-zero count,
// worst first, each linking to the tab that holds exactly those rows.
// ─────────────────────────────────────────────────────────────
import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { adminAttentionItems } from '../features/dashboard/adminAttention';
import { MemoryRouter } from 'react-router-dom';
import NeedsAttention from '../features/dashboard/components/NeedsAttention';

const zero = {
  inventory: { shortfall: 0, lowStock: 0, expiring: 0 },
  pickingSlips: { unassigned: 0, notCollected: 0 },
  purchaseOrders: { awaitingApproval: 0, followUp: 0 },
  communityRequests: { pending: 0 },
};

const renderList = (attention) =>
  render(<MemoryRouter><NeedsAttention attention={attention} /></MemoryRouter>);

beforeEach(() => window.localStorage.clear());

describe('NeedsAttention', () => {
  it('lists only what is non-zero, worst first, each linking to its tab', () => {
    renderList({
      ...zero,
      inventory: { shortfall: 2, lowStock: 9, expiring: 0 },
      purchaseOrders: { awaitingApproval: 1, followUp: 0 },
    });

    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      '2 products are promised beyond what is on hand',
      '1 purchase order is waiting for approval',
      '9 products are at or below the reorder level',
    ]);
    expect(links[0]).toHaveAttribute('href', '/noc/inventory?status=shortfall');
    expect(links[1]).toHaveAttribute('href', '/noc/purchase-orders?status=pending');
    expect(links[2]).toHaveAttribute('href', '/noc/inventory?status=lowstock');
  });

  it('says so when nothing needs attention', () => {
    renderList(zero);
    expect(screen.getByText('Nothing needs you right now.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a placeholder while the counts load, not "nothing needs you"', () => {
    renderList(null);
    expect(screen.queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
  });

  // Folded, it still says how much is waiting.
  it('folds away, keeps the count in view, and remembers being folded', () => {
    const busy = { ...zero, inventory: { shortfall: 2, lowStock: 9, expiring: 0 } };
    const { unmount } = renderList(busy);
    const header = screen.getByRole('button', { name: /Needs attention/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('2 to look at')).toBeInTheDocument();
    unmount();

    renderList(busy);
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('the admin’s Needs attention', () => {
  const data = {
    donations: 3, s18a: { queued: 1, qualifying_pending_donor: 0 }, gmail: { connected: false },
    products: [{ isActive: true, unitCost: null, weightKg: 1 }, { isActive: true, unitCost: 5, weightKg: 1 }],
  };

  it('waits until every figure has loaded', () => {
    expect(adminAttentionItems({ donations: 3 })).toBeNull();
  });

  it('lists what needs an admin, email first', () => {
    render(<MemoryRouter><NeedsAttention items={adminAttentionItems(data)} /></MemoryRouter>);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Email sending is off — certificates, reminders and Finance emails are not going out',
      '3 donations are waiting in the classification queue',
      '1 Section 18A certificate is ready to issue',
      '1 product has no cost or weight, so orders cannot estimate them',
    ]);
  });
});
