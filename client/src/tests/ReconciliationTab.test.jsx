// Tests for the Reconciliation tab component. The service module is mocked
// at its real path (client/src/services/donationManagementAPI.js — default
// export { getPendingDonations, retryCommit, ... }, plus the named export
// RECONCILIATION_STATUSES) while the real useReconciliationQueue hook runs,
// so the per-row retry isolation and post-retry refresh behaviour is
// exercised end-to-end through the hook.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ReconciliationTab from '../features/donationManagement/components/ReconciliationTab';
import { RECONCILIATION_STATUSES } from '../services/donationManagementAPI';

vi.mock('../services/donationManagementAPI', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      getPendingDonations: vi.fn(),
      retryCommit: vi.fn(),
    },
  };
});

import donationManagementAPI from '../services/donationManagementAPI';

const commitFailedDonation = {
  id: 25,
  status: 'commit_failed',
  donor_name: 'Failed Donor',
  donor_contact: 'failed@example.com',
  estimated_value_zar: 250,
  commit_failed_at: '2026-08-27T08:00:00.000Z',
  item_counts: { total: 2, resolved: 1, rejected: 1 },
  items: [
    { id: 1, status: 'resolved' },
    { id: 2, status: 'rejected' },
  ],
};

const commitIncompleteDonation = {
  id: 24,
  status: 'commit_incomplete',
  donor_name: 'Incomplete Donor',
  donor_contact: 'incomplete@example.com',
  estimated_value_zar: 75.5,
  commit_incomplete_at: '2026-08-27T09:00:00.000Z',
  item_counts: { total: 2, resolved: 1, awaiting_resolution: 1, rejected: 0 },
  items: [
    { id: 3, status: 'resolved' },
    { id: 4, status: 'awaiting_resolution' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  donationManagementAPI.retryCommit.mockResolvedValue({ committed: true });
});

const renderWith = async (rows) => {
  donationManagementAPI.getPendingDonations.mockResolvedValueOnce(rows);
  render(<ReconciliationTab />);
  return waitFor(() => expect(donationManagementAPI.getPendingDonations).toHaveBeenCalledWith(
    RECONCILIATION_STATUSES
  ));
};

describe('ReconciliationTab', () => {
  it('shows a loading state while fetching', () => {
    // Never-resolving promise keeps the component in its loading state.
    donationManagementAPI.getPendingDonations.mockReturnValueOnce(new Promise(() => {}));

    render(<ReconciliationTab />);

    // Skeletons are rendered and the Refresh button is disabled while loading.
    expect(document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeDisabled();
    expect(screen.queryByText('Commit failed')).not.toBeInTheDocument();
  });

  it('shows the empty state when there is nothing to reconcile', async () => {
    await renderWith([]);

    expect(screen.getByText('Nothing needs reconciling right now.')).toBeInTheDocument();
    expect(screen.getByText('0 donations stuck in a commit failure state.')).toBeInTheDocument();
  });

  it('renders each donation row with donor name, value and status', async () => {
    await renderWith([commitFailedDonation, commitIncompleteDonation]);

    expect(screen.getByText('Failed Donor')).toBeInTheDocument();
    expect(screen.getByText('Incomplete Donor')).toBeInTheDocument();
    // fmtValue: R 250.00 / R 75,50 (en-ZA decimal separator varies by ICU data).
    expect(screen.getByText(/R 250[.,]00/)).toBeInTheDocument();
    expect(screen.getByText(/R 75[.,]50/)).toBeInTheDocument();
    expect(screen.getByText('Commit failed')).toBeInTheDocument();
    expect(screen.getByText('Commit incomplete')).toBeInTheDocument();
    // Summary count line.
    expect(screen.getByText('2 donations stuck in a commit failure state.')).toBeInTheDocument();
  });

  it('shows the resolved-count line for commit_incomplete rows, computed from .items', async () => {
    await renderWith([commitIncompleteDonation]);

    // 1 resolved item of 2 total.
    expect(screen.getByText('1 of 2 items already resolved before the failure')).toBeInTheDocument();
  });

  it('does not show the resolved-count line for commit_failed rows', async () => {
    await renderWith([commitFailedDonation]);

    expect(screen.queryByText(/already resolved before the failure/)).not.toBeInTheDocument();
  });

  it('clicking Retry commit calls retryCommit with the donation id and removes the row after refresh', async () => {
    // First load returns both rows; the refresh after the successful retry
    // returns only the commit_incomplete row (the failed one was committed).
    donationManagementAPI.getPendingDonations
      .mockResolvedValueOnce([commitFailedDonation, commitIncompleteDonation])
      .mockResolvedValueOnce([commitIncompleteDonation]);

    render(<ReconciliationTab />);
    await screen.findByText('Failed Donor');

    const failedRow = screen.getByText('Failed Donor').closest('[data-slot="card"]');
    fireEvent.click(within(failedRow).getByRole('button', { name: /Retry commit/i }));

    await waitFor(() => {
      expect(donationManagementAPI.retryCommit).toHaveBeenCalledTimes(1);
      expect(donationManagementAPI.retryCommit).toHaveBeenCalledWith(25);
    });

    // refresh() runs after a successful retry — the row is gone, the other remains.
    await waitFor(() => {
      expect(donationManagementAPI.getPendingDonations).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText('Failed Donor')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Incomplete Donor')).toBeInTheDocument();
  });

  it('on retry failure shows a row-level error without disrupting other rows', async () => {
    donationManagementAPI.getPendingDonations.mockResolvedValue([
      commitFailedDonation,
      commitIncompleteDonation,
    ]);
    donationManagementAPI.retryCommit.mockRejectedValueOnce(new Error('Retry failed server-side'));

    render(<ReconciliationTab />);
    await screen.findByText('Failed Donor');

    const failedRow = screen.getByText('Failed Donor').closest('[data-slot="card"]');
    fireEvent.click(within(failedRow).getByRole('button', { name: /Retry commit/i }));

    // The error is attached to that row only.
    await screen.findByText('Retry failed server-side');

    // The failing row is still listed, and the untouched row renders intact
    // with no error banner of its own.
    expect(screen.getByText('Failed Donor')).toBeInTheDocument();
    expect(screen.getByText('Incomplete Donor')).toBeInTheDocument();

    // The queue was NOT replaced by a top-level banner (isolation behaviour):
    // exactly one error banner is present.
    expect(screen.getAllByText('Retry failed server-side').length).toBe(1);
    expect(screen.getByText('2 donations stuck in a commit failure state.')).toBeInTheDocument();
  });

  it('shows a top-level error banner with a Try again action when the initial load fails', async () => {
    donationManagementAPI.getPendingDonations.mockRejectedValueOnce(new Error('Network down'));

    render(<ReconciliationTab />);

    await screen.findByText('Network down');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // No rows rendered, no empty state either.
    expect(screen.queryByText('Nothing needs reconciling right now.')).not.toBeInTheDocument();
  });

  it('re-fetches when the top-level Refresh button is clicked', async () => {
    await renderWith([commitFailedDonation]);
    expect(donationManagementAPI.getPendingDonations).toHaveBeenCalledTimes(1);

    donationManagementAPI.getPendingDonations.mockResolvedValueOnce([commitFailedDonation]);
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

    await waitFor(() => {
      expect(donationManagementAPI.getPendingDonations).toHaveBeenCalledTimes(2);
    });
    expect(donationManagementAPI.getPendingDonations).toHaveBeenLastCalledWith(RECONCILIATION_STATUSES);
  });
});