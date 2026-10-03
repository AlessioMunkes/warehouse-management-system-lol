import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/settingsAPI', () => ({ checkConnections: vi.fn() }));

const { checkConnections } = await import('../services/settingsAPI');
const { default: ConnectionsSection } = await import('../features/settings/components/ConnectionsSection');

const RESULT = {
  checkedAt: '2026-10-03T08:15:00Z',
  connections: [
    { id: 'database', name: 'Database', status: 'ok', summary: 'Connected (12 ms)' },
    { id: 'push', name: 'Phone notifications', status: 'off', summary: 'No VAPID keys on the server' },
    { id: 'email', name: 'Email (Gmail)', status: 'down', summary: 'No Gmail account connected',
      fix: { label: 'Connect Gmail', section: 'email' } },
    { id: 'jobs', name: 'Scheduled jobs', status: 'warning', summary: 'Switched off: collection reminders' },
  ],
};

const renderSection = (onSection = vi.fn()) =>
  render(<MemoryRouter><ConnectionsSection onSection={onSection} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  checkConnections.mockResolvedValue(RESULT);
});

describe('Settings → Connections', () => {
  it('lists every connection, the worst news first', async () => {
    renderSection();
    expect(await screen.findByText('No Gmail account connected')).toBeInTheDocument();
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Email (Gmail)', 'Scheduled jobs', 'Database', 'Phone notifications']);
    expect(screen.getByText('Not working')).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    expect(screen.getByText(/2 need attention/)).toBeInTheDocument();
  });

  it('offers the fix, which opens its settings section', async () => {
    const user = userEvent.setup();
    const onSection = vi.fn();
    renderSection(onSection);
    await user.click(await screen.findByRole('button', { name: 'Connect Gmail' }));
    expect(onSection).toHaveBeenCalledWith('email');
  });

  it('checks again on request', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Database');
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(checkConnections).toHaveBeenCalledTimes(2));
  });

  it('says so when the check itself fails', async () => {
    checkConnections.mockRejectedValueOnce(new Error('Could not reach the server.'));
    renderSection();
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
  });
});
