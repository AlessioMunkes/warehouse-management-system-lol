import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const gmailAPI = {
  getStatus: vi.fn(),
  disconnect: vi.fn(),
  sendTestEmail: vi.fn(),
  saveDisplayName: vi.fn(),
  getConnectUrl: vi.fn(() => '/api/gmail/connect'),
};

const financeAPI = {
  getFinanceEmailSettings: vi.fn(),
  saveFinanceEmailSettings: vi.fn(),
  sendFinanceReportLink: vi.fn(),
};

vi.mock('../services/gmailAPI', () => ({ default: gmailAPI }));
vi.mock('../services/financeAPI', () => ({ default: financeAPI }));

const { default: GmailSettingsPage } = await import('../pages/GmailSettingsPage');

beforeEach(() => {
  vi.clearAllMocks();
  gmailAPI.getStatus.mockResolvedValue({
    connected: true,
    email: 'org@example.org',
    displayName: 'Ladles of Love',
  });
  financeAPI.getFinanceEmailSettings.mockResolvedValue({
    recipientEmail: 'finance@example.org',
  });
  financeAPI.saveFinanceEmailSettings.mockResolvedValue({
    recipientEmail: 'finance2@example.org',
  });
  financeAPI.sendFinanceReportLink.mockResolvedValue({
    sent: true,
    messageId: 'gmail-1',
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <GmailSettingsPage />
    </MemoryRouter>,
  );

describe('GmailSettingsPage Finance report link controls', () => {
  it('loads the saved Finance recipient email', async () => {
    renderPage();

    const input = await screen.findByLabelText(/Finance recipient email/i);
    expect(input).toHaveValue('finance@example.org');
  });

  it('saves the Finance recipient email', async () => {
    renderPage();
    const user = userEvent.setup();

    const input = await screen.findByLabelText(/Finance recipient email/i);
    await user.clear(input);
    await user.type(input, 'finance2@example.org');
    await user.click(screen.getByRole('button', { name: /Save Finance Recipient/i }));

    await waitFor(() => {
      expect(financeAPI.saveFinanceEmailSettings).toHaveBeenCalledWith({
        recipientEmail: 'finance2@example.org',
      });
    });
    expect(await screen.findByText('Finance recipient saved.')).toBeInTheDocument();
  });

  it('sends the Finance report link to the saved recipient', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByLabelText(/Finance recipient email/i);
    await user.click(screen.getByRole('button', { name: /Send Finance Report Link/i }));

    await waitFor(() => expect(financeAPI.sendFinanceReportLink).toHaveBeenCalled());
    expect(await screen.findByText('Finance report link sent.')).toBeInTheDocument();
  });

  it('shows a message box when sending without a Finance recipient', async () => {
    financeAPI.getFinanceEmailSettings.mockResolvedValueOnce({ recipientEmail: '' });
    renderPage();
    const user = userEvent.setup();

    const input = await screen.findByLabelText(/Finance recipient email/i);
    expect(input).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /Send Finance Report Link/i }));

    expect(await screen.findByText('Save a Finance recipient email before sending the report link.')).toBeInTheDocument();
    expect(financeAPI.sendFinanceReportLink).not.toHaveBeenCalled();
  });

  it('disables sending when Gmail is not connected', async () => {
    gmailAPI.getStatus.mockResolvedValueOnce({ connected: false });

    renderPage();

    const button = await screen.findByRole('button', { name: /Send Finance Report Link/i });
    expect(button).toBeDisabled();
  });
});
