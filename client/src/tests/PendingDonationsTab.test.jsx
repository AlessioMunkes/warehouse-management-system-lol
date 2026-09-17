import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PendingDonationsTab from '../features/donationManagement/components/PendingDonationsTab';

const mockUsePendingDonations = vi.fn();

vi.mock('../features/donationManagement/hooks/usePendingDonations', () => ({
  default: (...args) => mockUsePendingDonations(...args),
}));

const AWAITING_DONATION = {
  id: 21,
  donor_name: 'Awaiting Donor',
  estimated_value_zar: '90.00',
  donation_category: 'non_recipe_food',
  status: 'awaiting_resolution',
  created_at: new Date().toISOString(),
  items: [
    { id: 18, line_no: 1, description: 'Resolved item', status: 'resolved', quantity: '3.000', unit: 'kg' },
    { id: 19, line_no: 2, description: 'Awaiting item', status: 'awaiting_resolution', quantity: '3.000', unit: 'kg' },
    { id: 20, line_no: 3, description: 'Rejected item desc', status: 'rejected', quantity: '1.000', unit: 'kg', rejection_reason: 'Beyond use' },
  ],
  item_counts: { total: 3, resolved: 1, awaiting_resolution: 1, rejected: 1 },
};

const COMMITTING_DONATION = {
  id: 22,
  donor_name: 'Committing Donor',
  estimated_value_zar: '50.00',
  donation_category: null,
  status: 'committing',
  created_at: new Date().toISOString(),
  items: [{ id: 23, line_no: 1, description: 'Committed item', status: 'committed', quantity: '2.000', unit: 'kg' }],
  item_counts: { total: 1, resolved: 0, awaiting_resolution: 0, rejected: 0 },
};

const FAILED_DONATION = {
  id: 23,
  donor_name: 'Failed Donor',
  estimated_value_zar: '25.00',
  donation_category: 'recipe_food',
  status: 'commit_failed',
  created_at: new Date().toISOString(),
  items: [{ id: 24, line_no: 1, description: 'Failed item', status: 'resolved', quantity: '1.000', unit: 'kg' }],
  item_counts: { total: 1, resolved: 1, awaiting_resolution: 0, rejected: 0 },
};

const baseHook = (overrides = {}) => ({
  items: [],
  isLoading: false,
  error: '',
  refresh: vi.fn(),
  ...overrides,
});

describe('PendingDonationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading skeleton while fetching', () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ isLoading: true }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);
    expect(screen.getByText(/pending donation/i)).toBeInTheDocument();
  });

  it('renders an empty state when there are no donations', () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [] }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);
    expect(screen.getByText('No pending donations match the current scope.')).toBeInTheDocument();
  });

  it('renders each pending donation card with donor, value, status and item counts', () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [AWAITING_DONATION, COMMITTING_DONATION] }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);

    expect(screen.getByText('Awaiting Donor')).toBeInTheDocument();
    expect(screen.getByText('Committing Donor')).toBeInTheDocument();
    expect(screen.getByText('R 90,00')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('always shows the item list fully expanded with a counts summary', () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [AWAITING_DONATION] }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);

    expect(screen.getByText('1 resolved · 1 awaiting · 1 rejected')).toBeInTheDocument();
    // Item rows are always present (never collapsed).
    expect(screen.getByText('Resolved item')).toBeInTheDocument();
    expect(screen.getByText('Awaiting item')).toBeInTheDocument();
  });

  it('renders rejected items struck-through with an always-visible reason', () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [AWAITING_DONATION] }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);

    const rejectedSpan = screen.getByText('Rejected item desc');
    expect(rejectedSpan).toHaveClass('line-through');
    expect(screen.getByText('Beyond use')).toBeInTheDocument();
  });

  it('calls onReconcileTab when a commit_failed badge label is clicked', () => {
    const onReconcileTab = vi.fn();
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [FAILED_DONATION] }));
    render(<PendingDonationsTab onReconcileTab={onReconcileTab} />);

    fireEvent.click(screen.getByRole('button', { name: 'Commit failed — reconcile' }));
    expect(onReconcileTab).toHaveBeenCalledTimes(1);
  });

  it('does not offer a retry action on the pending donations tab', () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [FAILED_DONATION] }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows an error banner with a retry link on load failure', async () => {
    mockUsePendingDonations.mockReturnValue(baseHook({ error: 'Could not load pending donations.', items: [] }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);

    expect(screen.getByText('Could not load pending donations.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('invokes refresh when the Refresh button is clicked', () => {
    const refresh = vi.fn();
    mockUsePendingDonations.mockReturnValue(baseHook({ items: [], refresh }));
    render(<PendingDonationsTab onReconcileTab={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
