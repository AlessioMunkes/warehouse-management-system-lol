import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Section18AManagementPage from '../pages/Section18AManagementPage';

vi.mock('../components/layout/TopNavBar', () => ({
  TopNavbar: () => <div>TopNavbar</div>,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));

vi.mock('../services/donationManagementAPI', () => ({
  default: {
    getSection18AQueue: vi.fn(),
    getEmailHistory: vi.fn(),
    generateCertificate: vi.fn(),
    resendEmail: vi.fn(),
    verifyDonationValue: vi.fn(),
  },
}));

const api = (await import('../services/donationManagementAPI')).default;

const mockQueueItems = [
  {
    id: 'DON-1001',
    reference: 'DON-1001',
    donor_name: 'Jane Doe',
    received_at: '2026-09-10T10:00:00Z',
    estimated_value_zar: 500,
    status: 'received',
    section_18a_status: 'queued',
    certificate_generated: false,
  },
  {
    id: 'DON-1002',
    reference: 'DON-1002',
    donor_name: 'Acme Corp',
    received_at: '2026-09-12T14:30:00Z',
    estimated_value_zar: 2500,
    status: 'completed',
    section_18a_status: 'issued',
    certificate_generated: true,
  },
];

const mockEmailHistory = [
  {
    id: 'email-1',
    recipient_email: 'jane@example.com',
    donor_name: 'Jane Doe',
    donation_id: 'DON-1001',
    email_type: 'SECTION_18A',
    subject: 'Your Section 18A Certificate',
    status: 'SENT',
    sent_at: '2026-09-10T10:05:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getSection18AQueue.mockResolvedValue(mockQueueItems);
  api.getEmailHistory.mockResolvedValue(mockEmailHistory);
});

describe('Section18AManagementPage', () => {
  it('renders queue with donor, reference, date, amount, and no certificate settings navigation', async () => {
    render(<Section18AManagementPage />);

    expect(await screen.findByRole('heading', { name: 'Section 18A' })).toBeInTheDocument();
    expect(await screen.findByText('DON-1001')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('R500.00')).toBeInTheDocument();

    expect(screen.getByText('DON-1002')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('R2500.00')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Settings/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/certificate settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Donation Status')).not.toBeInTheDocument();
  });

  it('does NOT display manual Generate, Regenerate, or Download buttons in the queue', async () => {
    render(<Section18AManagementPage />);

    await screen.findByText('DON-1001');

    expect(screen.queryByRole('button', { name: /Generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Regenerate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();
  });

  it('preserves email history tab functionality', async () => {
    const user = userEvent.setup();
    render(<Section18AManagementPage />);

    await screen.findByText('DON-1001');

    const emailTabBtn = screen.getByRole('tab', { name: /Email history/i });
    await user.click(emailTabBtn);

    expect(await screen.findByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Your Section 18A Certificate')).toBeInTheDocument();
  });

  it('filters queue by donor name and amount, then sorts by date', async () => {
    const user = userEvent.setup();
    render(<Section18AManagementPage />);

    await screen.findByText('DON-1001');

    await user.type(screen.getByLabelText('Search by donor name'), 'Acme');
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search by donor name'));
    await user.type(screen.getByLabelText('Minimum amount'), '1000');
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Minimum amount'));
    await user.selectOptions(screen.getByLabelText('Sort certificate queue'), 'date-desc');
    const donations = screen.getAllByText(/DON-100[12]/).map((node) => node.textContent);
    expect(donations).toEqual(['DON-1002', 'DON-1001']);
  });

  // An estimated value is verified, or corrected, by a manager before a
  // certificate goes out; an issued one is left as it is.
  it('lets a manager verify an estimated value, and not an issued one', async () => {
    const user = userEvent.setup();
    api.getSection18AQueue.mockResolvedValue([
      { ...mockQueueItems[0], value_estimated: true },
      mockQueueItems[1],
    ]);
    api.verifyDonationValue.mockResolvedValue({});
    render(<Section18AManagementPage />);

    const row = (await screen.findByText('Jane Doe')).closest('tr');
    expect(within(row).getByText('Estimated from the items')).toBeInTheDocument();
    expect(within(screen.getByText('Acme Corp').closest('tr')).queryByRole('button', { name: 'Verify value' })).toBeNull();

    await user.click(within(row).getByRole('button', { name: 'Verify value' }));
    const amount = within(row).getByLabelText('Value of donation DON-1001');
    await user.clear(amount);
    await user.type(amount, '450');
    await user.click(within(row).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.verifyDonationValue).toHaveBeenCalledWith('DON-1001', 450));
  });
});
