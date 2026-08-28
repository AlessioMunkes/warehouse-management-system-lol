import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DonationManagementPage from '../pages/DonationManagementPage';

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
  TopNavbar: () => <div>Top Navbar</div>,
}));

vi.mock('../features/donationManagement/components/FlaggedItemsTab', () => ({
  default: () => <div>Flagged Items Tab</div>,
}));

vi.mock('../features/donationManagement/components/PendingDonationsTab', () => ({
  default: () => <div>Pending Donations Tab</div>,
}));

vi.mock('../features/donationManagement/components/ReconciliationTab', () => ({
  default: () => <div>Reconciliation Tab</div>,
}));

describe('DonationManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, tab strip and the Flagged Items tab by default', () => {
    render(<DonationManagementPage />);

    expect(screen.getByText('Donation Management')).toBeInTheDocument();
    expect(screen.getByText('Flagged Items', { selector: 'button' })).toBeInTheDocument();
    expect(screen.getByText('Pending Donations')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Flagged Items Tab')).toBeInTheDocument();
  });

  it('renders the real Pending Donations tab when selected', () => {
    render(<DonationManagementPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Pending Donations' }));
    expect(screen.getByText('Pending Donations Tab')).toBeInTheDocument();
    expect(screen.queryByText('This tab is coming soon.')).not.toBeInTheDocument();
  });

  it('renders the real Reconciliation tab when selected', () => {
    render(<DonationManagementPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconciliation' }));
    expect(screen.getByText('Reconciliation Tab')).toBeInTheDocument();
    expect(screen.queryByText('This tab is coming soon.')).not.toBeInTheDocument();
  });
});
