import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FlaggedItemsTab from '../features/donationManagement/components/FlaggedItemsTab';

const mockUseFlaggedItems = vi.fn();

vi.mock('../features/donationManagement/hooks/useFlaggedItems', () => ({
  default: (...args) => mockUseFlaggedItems(...args),
}));

const INTAKE_FLAG = {
  flag_id: 1,
  product_id: 260,
  name: '[Unclassified] Mystery item (12345)',
  is_active: false,
  quantity_kg: 3,
  reason: 'Slice1 intake line 1',
  status: 'pending_classification',
  pending_donation_id: 21,
  pending_donation_item_id: 5,
  donor_name: 'Donor A',
  donation_category: 'non_recipe_food',
  item_description: 'Mystery item',
  item_unit: 'kg',
};

const LEGACY_FLAG = {
  flag_id: 2,
  product_id: 261,
  name: 'Canned Beans',
  sku: 'BEANS-1',
  storage_type: 'dry',
  default_unit: 'kg',
  donation_category: '',
  is_active: false,
  quantity_kg: 2,
  reason: 'Legacy placeholder',
  status: 'pending_classification',
  pending_donation_id: null,
  pending_donation_item_id: null,
};

const baseHook = (overrides = {}) => ({
  items: [INTAKE_FLAG, LEGACY_FLAG],
  isLoading: false,
  error: '',
  pendingFlagIds: [],
  refresh: vi.fn(),
  resolveFlag: vi.fn().mockResolvedValue({
    pendingDonationId: 21,
    status: 'awaiting_resolution',
    flagId: 1,
    finalized: true,
  }),
  ...overrides,
});

describe('FlaggedItemsTab', () => {
  beforeEach(() => {
    mockUseFlaggedItems.mockReturnValue(baseHook());
  });

  it('renders both flag cards with plain-language source badges', () => {
    render(<FlaggedItemsTab />);

    expect(screen.getByText('From a donation')).toBeInTheDocument();
    expect(screen.getByText('Standalone item')).toBeInTheDocument();
    expect(screen.queryByText('Intake')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy')).not.toBeInTheDocument();
    expect(screen.getByText('Mystery item')).toBeInTheDocument();
    expect(screen.getByText('Canned Beans')).toBeInTheDocument();
    // Matches the placeholder rule: name starts with '[Unclassified]'.
    expect(screen.getAllByText('Placeholder').length).toBe(2);
  });

  it('does not expose the SKU as an editable field', () => {
    render(<FlaggedItemsTab />);

    expect(screen.queryByLabelText(/SKU/i)).not.toBeInTheDocument();
    expect(screen.queryByText('SKU')).not.toBeInTheDocument();
  });

  it('accepts an intake flag through the unified resolve call', async () => {
    const resolveFlag = vi.fn().mockResolvedValue({
      pendingDonationId: 21,
      status: 'awaiting_resolution',
      flagId: 1,
      finalized: true,
    });
    mockUseFlaggedItems.mockReturnValue(baseHook({ resolveFlag }));

    render(<FlaggedItemsTab />);

    // Category preselected from the enriched donation_category, so Classify is live.
    fireEvent.click(screen.getByRole('button', { name: 'Classify' }));

    await waitFor(() => {
      expect(resolveFlag).toHaveBeenCalledWith(1, { accepted: true, category: 'non_recipe_food' });
    });
    expect(await screen.findByText('Awaiting further resolutions.')).toBeInTheDocument();
  });

  it('shows a  committing confirmation when the classify resolves the last open flag', async () => {
    mockUseFlaggedItems.mockReturnValue(baseHook({ resolveFlag: vi.fn().mockResolvedValue({ pendingDonationId: 21, status: 'committing', flagId: 1, finalized: true }) }));

    render(<FlaggedItemsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Classify' }));
    expect(await screen.findByText('Donation now committing.')).toBeInTheDocument();
  });

  it('keeps the Reject button disabled until a reason is typed, then rejects', async () => {
    const resolveFlag = vi.fn().mockResolvedValue({
      pendingDonationId: 21,
      status: 'awaiting_resolution',
      flagId: 1,
      finalized: true,
    });
    mockUseFlaggedItems.mockReturnValue(baseHook({ resolveFlag }));

    render(<FlaggedItemsTab />);

    const rejectButton = screen.getByRole('button', { name: 'Reject' });
    expect(rejectButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'Damaged beyond use' } });
    expect(rejectButton).toBeEnabled();

    fireEvent.click(rejectButton);
    await waitFor(() => {
      expect(resolveFlag).toHaveBeenCalledWith(1, { accepted: false, reason: 'Damaged beyond use' });
    });
  });

  it('resolves a standalone flag with the finalize-style fields, SKU omitted', async () => {
    const resolveFlag = vi.fn().mockResolvedValue({
      product: { name: 'Canned Beans' },
      flag: { status: 'resolved' },
      message: 'Unrecognized item finalized and marked as resolved.',
    });
    mockUseFlaggedItems.mockReturnValue(baseHook({ resolveFlag }));

    render(<FlaggedItemsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      // No sku in the payload: the server generates its placeholder SKU
      // (FLAG-<flagId>) when the field is absent.
      expect(resolveFlag).toHaveBeenCalledWith(2, {
        accepted: true,
        name: 'Canned Beans',
        storageType: 'dry',
        defaultUnit: 'kg',
        category: '',
      });
    });
    expect(await screen.findByText('Resolved.')).toBeInTheDocument();
  });

  it('shows an empty state when there are no flags', () => {
    mockUseFlaggedItems.mockReturnValue(baseHook({ items: [] }));
    render(<FlaggedItemsTab />);

    expect(screen.getByText('No flagged items pending review.')).toBeInTheDocument();
  });
});
