import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NeedsAttention from '../features/dashboard/NeedsAttention';
import { toAttention } from '../services/dashboardAPI';
import { ROUTES } from '../routes/routeTable';

const zero = {
  inventory: { shortfall: 0, lowStock: 0, expiring: 0 },
  pickingSlips: { unassigned: 0, notCollected: 0 },
  purchaseOrders: { awaitingApproval: 0, followUp: 0 },
  communityRequests: { pending: 0, approved: 0, overdue: 0, needsItems: 0 },
};

const renderList = (attention) =>
  render(<MemoryRouter><NeedsAttention attention={attention} /></MemoryRouter>);

beforeEach(() => window.localStorage.clear());

describe('Needs attention: benevolent requests', () => {
  it('says how many are waiting for approval, and links to that tab', () => {
    renderList({ ...zero, communityRequests: { ...zero.communityRequests, pending: 3 } });
    const link = screen.getByRole('link', { name: '3 benevolent requests are waiting for approval' });
    expect(link).toHaveAttribute('href', '/noc/community-requests?status=pending');
  });

  // The Approved tab holds every approved request waiting to go out,
  // claimed or not, so the line counts the same rows it opens.
  it('says how many approved requests are waiting to go out, and links to the Approved tab', () => {
    renderList({ ...zero, communityRequests: { ...zero.communityRequests, approved: 1 } });
    const link = screen.getByRole('link', { name: '1 approved request is waiting to go out' });
    expect(link).toHaveAttribute('href', '/noc/community-requests?status=approved');
  });

  it('says how many need new items, and links to the Needs new items tab', () => {
    renderList({ ...zero, communityRequests: { ...zero.communityRequests, needsItems: 2 } });
    const link = screen.getByRole('link', { name: '2 benevolent requests need new items' });
    expect(link).toHaveAttribute('href', '/noc/community-requests?status=needs-items');
  });

  it('uses the singular for one', () => {
    renderList({ ...zero, communityRequests: { pending: 1, approved: 0, needsItems: 1 } });
    expect(screen.getByRole('link', { name: '1 benevolent request needs new items' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1 benevolent request is waiting for approval' })).toBeInTheDocument();
  });

  it('says how many have not gone out after a week, and links to that tab', () => {
    renderList({ ...zero, communityRequests: { ...zero.communityRequests, overdue: 2 } });
    const link = screen.getByRole('link', { name: '2 approved requests have not gone out after a week' });
    expect(link).toHaveAttribute('href', '/noc/community-requests?status=overdue');
  });

  it('puts "need new items" above "waiting for approval", and approved last of the three', () => {
    renderList({ ...zero, communityRequests: { pending: 1, approved: 1, needsItems: 1 } });
    const text = screen.getAllByRole('link').map((l) => l.textContent);
    expect(text.indexOf('1 benevolent request needs new items'))
      .toBeLessThan(text.indexOf('1 benevolent request is waiting for approval'));
    expect(text.indexOf('1 benevolent request is waiting for approval'))
      .toBeLessThan(text.indexOf('1 approved request is waiting to go out'));
  });

  it('shows none of them when all three are zero', () => {
    renderList(zero);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('the dashboard counts', () => {
  it('map all four from the server', () => {
    const a = toAttention({ communityRequests: { pending: 4, approved: 2, overdue: 1, needsItems: 1 } });
    expect(a.communityRequests).toEqual({ pending: 4, approved: 2, overdue: 1, needsItems: 1 });
  });

  it('read a missing count as zero', () => {
    expect(toAttention({ communityRequests: { pending: 4 } }).communityRequests)
      .toEqual({ pending: 4, approved: 0, overdue: 0, needsItems: 0 });
  });
});

describe('the sidebar count for Benevolent Requests', () => {
  const count = ROUTES.find((r) => r.id === 'communityRequests').nav
    .find((n) => n.menu === 'manager').count;

  it('is waiting for approval, need new items and not gone out after a week', () => {
    expect(count({ communityRequests: { pending: 3, approved: 5, overdue: 1, needsItems: 2 } })).toBe(6);
  });

  it('does not count approved requests that are simply waiting', () => {
    expect(count({ communityRequests: { pending: 0, approved: 9, needsItems: 0 } })).toBe(0);
  });

  it('copes with counts that are not there yet', () => {
    expect(count({ communityRequests: { pending: 2 } })).toBe(2);
  });
});
