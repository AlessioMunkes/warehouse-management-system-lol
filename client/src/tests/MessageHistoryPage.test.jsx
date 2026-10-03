// ─────────────────────────────────────────────────────────────
// src/tests/MessageHistoryPage.test.jsx
//
// The admin's one view of every email sent: tabs by outcome (in the
// URL), the type filter, and what each row says.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/communicationsAPI', () => ({ getMessages: vi.fn() }));
const { getMessages } = await import('../services/communicationsAPI');
const { default: MessageHistoryPage } = await import('../pages/MessageHistoryPage');

const TYPES = [
  { key: 'user_invite', label: 'Account invite' },
  { key: 'purchase_order_finance', label: 'Purchase order to finance' },
];
const MESSAGES = [
  { id: 2, type: 'purchase_order_finance', recipient: 'finance@lol.org', subject: 'PO-2026-0058', status: 'failed',
    error: 'Quota exceeded', relatedType: 'purchase_order', relatedId: '58', attemptedAt: '2026-10-02T08:00:00Z', sentByName: null },
  { id: 1, type: 'user_invite', recipient: 'new@lol.org', subject: 'You are invited', status: 'sent',
    error: null, relatedType: 'user_invite', relatedId: '4', attemptedAt: '2026-10-01T08:00:00Z', sentByName: 'Grizel' },
];

const renderPage = (url = '/admin/messages') =>
  render(<MemoryRouter initialEntries={[url]}><MessageHistoryPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  getMessages.mockResolvedValue({ messages: MESSAGES, nextCursor: null, types: TYPES });
});

describe('MessageHistoryPage', () => {
  it('lists each message with its type, recipient, outcome and the reason it failed', async () => {
    renderPage();
    expect(await screen.findByText('Purchase order to finance')).toBeInTheDocument();
    expect(screen.getByText('finance@lol.org')).toBeInTheDocument();
    expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Sent')).toBeInTheDocument();
    // Sent by nobody in particular reads as the system, not a blank.
    expect(screen.getByText('The system')).toBeInTheDocument();
  });

  it('links a purchase-order email to its order', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Purchase order' })).toHaveAttribute('href', '/noc/purchase-orders?id=58');
  });

  it('asks the server for one outcome when a tab says so', async () => {
    renderPage('/admin/messages?status=failed');
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' })));
  });

  it('filters by type, and shows it as a chip that removes it', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('finance@lol.org');

    await user.click(screen.getByRole('combobox', { name: 'Message type' }));
    await user.click(await screen.findByRole('option', { name: 'Account invite' }));
    await waitFor(() => expect(getMessages).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'user_invite' })));

    await user.click(screen.getByRole('button', { name: 'Remove filter: Account invite' }));
    await waitFor(() => expect(getMessages).toHaveBeenLastCalledWith(expect.objectContaining({ type: undefined })));
  });
});
