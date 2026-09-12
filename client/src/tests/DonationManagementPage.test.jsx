import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DonationManagementPage from '../pages/DonationManagementPage';

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
  TopNavbar: () => <div>Top Navbar</div>,
}));

vi.mock('../features/donationManagement/components/FlaggedItemsTab', () => ({
  default: () => <div>Awaiting Classification Tab</div>,
}));

vi.mock('../features/donationManagement/components/ReconciliationTab', () => ({
  default: ({ actionLabel }) => <div>{actionLabel} Tab</div>,
}));

vi.mock('../services/donationManagementAPI', () => ({
  RECONCILIATION_STATUSES: ['commit_failed', 'commit_incomplete'],
  default: {
    getFlaggedItems: vi.fn(() => Promise.resolve([{ flag_id: 1 }, { flag_id: 2 }])),
    getPendingDonations: vi.fn(() => Promise.resolve([
      { id: 10, status: 'commit_incomplete' },
      { id: 11, status: 'commit_failed' },
    ])),
  },
}));

describe('DonationManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, tab strip and the Awaiting Classification tab by default', async () => {
    render(<DonationManagementPage />);

    expect(screen.getByText('Classification Queue')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Classification', { selector: 'button' })).toBeInTheDocument();
    expect(screen.getByText('Reconciliation', { selector: 'button' })).toBeInTheDocument();
    expect(screen.getByText('Processing Failed', { selector: 'button' })).toBeInTheDocument();
    expect(screen.getByText('Awaiting Classification Tab')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Awaiting Classification 2/ })).toBeInTheDocument());
  });

  it('renders the reconciliation queue when selected', () => {
    render(<DonationManagementPage />);

    fireEvent.click(screen.getByRole('tab', { name: /Reconciliation/ }));
    expect(screen.getByText('Resolve Tab')).toBeInTheDocument();
    expect(screen.queryByText('This tab is coming soon.')).not.toBeInTheDocument();
  });

  it('renders the processing failed queue when selected', () => {
    render(<DonationManagementPage />);

    fireEvent.click(screen.getByRole('tab', { name: /Processing Failed/ }));
    expect(screen.getByText('Retry Tab')).toBeInTheDocument();
    expect(screen.queryByText('This tab is coming soon.')).not.toBeInTheDocument();
  });
});