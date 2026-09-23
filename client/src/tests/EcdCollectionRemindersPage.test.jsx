import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EcdCollectionRemindersPage from '../pages/EcdCollectionRemindersPage';
import collectionReminderAPI from '../services/collectionReminderAPI';

vi.mock('../features/taskdashboard/components/ManagerLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('../services/collectionReminderAPI', () => ({
  default: {
    getTomorrowCollectionReminders: vi.fn(),
    markWhatsAppReminderSent: vi.fn(),
    retryEmailReminder: vi.fn(),
  },
}));

const rows = [
  {
    id: 1,
    ecdName: 'Little Stars',
    contactName: 'Nomsa',
    collectionDate: '2026-09-24',
    collectionTime: '09:00',
    emailStatus: 'sent',
    whatsappStatus: 'pending',
    mobileNumber: '0821234567',
    whatsappLink: 'https://wa.me/27821234567?text=Hello',
  },
  {
    id: 2,
    ecdName: 'No Phone ECD',
    contactName: 'Aviwe',
    collectionDate: '2026-09-24',
    emailStatus: 'failed',
    whatsappStatus: 'pending',
    mobileNumber: '',
    whatsappLink: null,
    canRetryEmail: false,
  },
  {
    id: 3,
    ecdName: 'Retry ECD',
    contactName: 'Mila',
    collectionDate: '2026-09-24',
    emailStatus: 'failed',
    whatsappStatus: 'pending',
    mobileNumber: '27821230000',
    whatsappLink: 'https://wa.me/27821230000?text=Hello',
    canRetryEmail: true,
    emailRetryUrl: '/api/retry-email',
  },
];

const load = (overrides = {}) => {
  collectionReminderAPI.getTomorrowCollectionReminders.mockResolvedValue({
    collectionDate: '2026-09-24',
    reminders: rows,
    ...overrides,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  load();
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('EcdCollectionRemindersPage', () => {
  it('shows tomorrow reminder queue details', async () => {
    render(<EcdCollectionRemindersPage />);

    expect(await screen.findByText('Little Stars')).toBeInTheDocument();
    expect(screen.getByText(/sent manually from the WhatsApp account currently logged in on this device or browser/i))
      .toBeInTheDocument();
    expect(screen.getByText('Nomsa')).toBeInTheDocument();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    expect(screen.getByText('0821234567')).toBeInTheDocument();

    const littleStarsRow = screen.getByText('Little Stars').closest('tr');
    expect(within(littleStarsRow).getByText('Sent')).toBeInTheDocument();
    expect(within(littleStarsRow).getByText('Pending')).toBeInTheDocument();
  });

  it('opens the backend wa.me link for WhatsApp', async () => {
    const user = userEvent.setup();
    render(<EcdCollectionRemindersPage />);

    const littleStarsRow = (await screen.findByText('Little Stars')).closest('tr');
    const openButton = within(littleStarsRow).getByRole('button', { name: /open whatsapp for little stars/i });
    expect(openButton).toHaveAttribute(
      'title',
      expect.stringContaining('Send it manually from the account logged in on this device.')
    );
    await user.click(openButton);

    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/27821234567?text=Hello',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('disables WhatsApp actions when no usable mobile/link is available', async () => {
    render(<EcdCollectionRemindersPage />);

    const noPhoneRow = (await screen.findByText('No Phone ECD')).closest('tr');
    expect(within(noPhoneRow).getByRole('button', { name: /open whatsapp for no phone ecd/i })).toBeDisabled();
    expect(within(noPhoneRow).getByRole('button', { name: /mark whatsapp sent for no phone ecd/i })).toBeDisabled();
  });

  it('marks WhatsApp reminders sent manually', async () => {
    const user = userEvent.setup();
    collectionReminderAPI.markWhatsAppReminderSent.mockResolvedValueOnce({
      id: 1,
      whatsappStatus: 'sent',
    });

    render(<EcdCollectionRemindersPage />);

    const littleStarsRow = (await screen.findByText('Little Stars')).closest('tr');
    const markSentButton = within(littleStarsRow).getByRole('button', { name: /mark whatsapp sent for little stars/i });
    expect(markSentButton).toHaveAttribute(
      'title',
      'After sending the WhatsApp message manually, mark it sent in WMS.'
    );
    await user.click(markSentButton);

    expect(collectionReminderAPI.markWhatsAppReminderSent).toHaveBeenCalledWith(1);
    await waitFor(() => expect(within(littleStarsRow).getAllByText('Sent').length).toBeGreaterThanOrEqual(2));
  });

  it('only shows email retry when the loaded reminder advertises support', async () => {
    render(<EcdCollectionRemindersPage />);

    const noPhoneRow = (await screen.findByText('No Phone ECD')).closest('tr');
    const retryRow = screen.getByText('Retry ECD').closest('tr');

    expect(within(noPhoneRow).queryByRole('button', { name: /retry email/i })).not.toBeInTheDocument();
    expect(within(retryRow).getByRole('button', { name: /retry email/i })).toBeInTheDocument();
  });
});
