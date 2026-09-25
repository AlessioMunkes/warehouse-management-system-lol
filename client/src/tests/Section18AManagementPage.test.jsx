import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Section18AManagementPage from '../pages/Section18AManagementPage';

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
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

    expect(await screen.findByText('Section 18A Management')).toBeInTheDocument();
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

    const emailTabBtn = screen.getByRole('tab', { name: /Email Integration/i });
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
});
