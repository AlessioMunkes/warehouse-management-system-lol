import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DonationClassificationPage from '../pages/DonationClassificationPage';

const mockUseDonationClassification = vi.fn();

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
  TopNavbar: () => <div>Top Navbar</div>,
}));

vi.mock('../features/donationAdmin/hooks/useDonationClassification', () => ({
  default: (...args) => mockUseDonationClassification(...args),
}));

describe('DonationClassificationPage', () => {
  beforeEach(() => {
    mockUseDonationClassification.mockReturnValue({
      paginatedProducts: [
        {
          id: 1,
          name: 'Rice Pack',
          sku: 'RICE-001',
          donation_category: null,
        },
      ],
      searchTerm: '',
      setSearchTerm: vi.fn(),
      showOnlyUnclassified: false,
      setShowOnlyUnclassified: vi.fn(),
      isLoading: false,
      error: '',
      page: 1,
      setPage: vi.fn(),
      totalPages: 1,
      updateCategory: vi.fn().mockResolvedValue(true),
      removeCategory: vi.fn().mockResolvedValue(true),
      pendingIds: [],
    });
  });

  it('renders the screen title and products table', () => {
    render(<DonationClassificationPage />);

    expect(screen.getByText('Donation Classification')).toBeInTheDocument();
    expect(screen.getByText('Rice Pack')).toBeInTheDocument();
    expect(screen.getByText('RICE-001')).toBeInTheDocument();
    expect(screen.getByText('Top Navbar')).toBeInTheDocument();
  });

  it('allows the user to switch the unclassified filter', () => {
    const setShowOnlyUnclassified = vi.fn();
    mockUseDonationClassification.mockReturnValue({
      paginatedProducts: [],
      searchTerm: '',
      setSearchTerm: vi.fn(),
      showOnlyUnclassified: true,
      setShowOnlyUnclassified,
      isLoading: false,
      error: '',
      page: 1,
      setPage: vi.fn(),
      totalPages: 1,
      updateCategory: vi.fn(),
      removeCategory: vi.fn(),
      pendingIds: [],
    });

    render(<DonationClassificationPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Unclassified only' }));
    expect(setShowOnlyUnclassified).toHaveBeenCalledWith(true);
  });
});
