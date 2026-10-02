// ─────────────────────────────────────────────────────────────
// src/tests/NeedsAttention.test.jsx
//
// The dashboard's "Needs attention" list: one line per non-zero count,
// worst first, each linking to the tab that holds exactly those rows.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
