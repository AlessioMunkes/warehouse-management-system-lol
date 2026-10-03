// ─────────────────────────────────────────────────────────────
// src/tests/SettingsPage.test.jsx
//
// The admin Settings page: sections in ?section=, the values that used
// to be constants (saved together, only what changed), and the
// certificate details that had an API but no screen.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/settingsAPI', () => ({
  listSettings: vi.fn(),
  updateSettings: vi.fn(),
  getCertificateSettings: vi.fn(),
  saveCertificateSettings: vi.fn(),
}));
vi.mock('../services/reportingAPI', () => ({
  default: { getFactorHistory: vi.fn(async () => ({ data: [{ value: 2.5 }] })), setFactor: vi.fn() },
}));
// The Gmail section has its own tests; here it only has to appear.
vi.mock('../pages/GmailSettingsPage', () => ({ default: () => <p>Gmail connection panel</p> }));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));

const api = await import('../services/settingsAPI');
const { default: SettingsPage } = await import('../pages/SettingsPage');

const SETTINGS = [
  { key: 'dispatch.nonCollectionCutoffHour', section: 'notifications', label: 'Not-collected cut-off',
    help: 'After this hour…', default: 15, min: 0, max: 23, unit: ':00', value: 15, isDefault: true },
  { key: 'reminders.runHour', section: 'notifications', label: 'Collection reminder send time',
    help: 'Reminders go out…', default: 8, min: 0, max: 23, unit: ':00', value: 8, isDefault: true },
  { key: 'invites.linkDays', section: 'accounts', label: 'Invite link lifetime',
    help: 'How long…', default: 7, min: 1, max: 30, unit: 'days', value: 7, isDefault: true },
];

const renderAt = (url = '/admin/settings', props = {}) =>
  render(<MemoryRouter initialEntries={[url]}><SettingsPage {...props} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.listSettings.mockResolvedValue(SETTINGS);
  api.updateSettings.mockResolvedValue(SETTINGS);
  api.getCertificateSettings.mockResolvedValue(null);
  api.saveCertificateSettings.mockResolvedValue({ organisationName: 'Ladles of Love' });
});

describe('SettingsPage', () => {
  it('opens on Email, the Gmail connection', () => {
    renderAt();
    expect(screen.getByRole('tab', { name: 'Email' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Gmail connection panel')).toBeInTheDocument();
  });

  it('shows only its own section\'s values, with their defaults', async () => {
    renderAt('/admin/settings?section=notifications');
    expect(await screen.findByLabelText('Not-collected cut-off')).toHaveValue(15);
    expect(screen.getByLabelText('Collection reminder send time')).toHaveValue(8);
    expect(screen.queryByLabelText('Invite link lifetime')).not.toBeInTheDocument();
    expect(screen.getByText(/Default 15:00/)).toBeInTheDocument();
  });

  it('saves only what changed, as numbers', async () => {
    const user = userEvent.setup();
    renderAt('/admin/settings?section=notifications');

    const cutoff = await screen.findByLabelText('Not-collected cut-off');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(cutoff);
    await user.type(cutoff, '16');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ 'dispatch.nonCollectionCutoffHour': 16 }));
  });

  it('shows the server\'s reason when a save is refused', async () => {
    api.updateSettings.mockRejectedValue(new Error('Invite link lifetime must be from 1 to 30.'));
    const user = userEvent.setup();
    renderAt('/admin/settings?section=accounts');

    const days = await screen.findByLabelText('Invite link lifetime');
    await user.clear(days);
    await user.type(days, '45');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('must be from 1 to 30');
  });

  it('shows the impact factors under Reporting, with the value in force', async () => {
    renderAt('/admin/settings?section=reporting');
    expect(await screen.findByLabelText('How many meals does 1 kg feed?')).toHaveAttribute('placeholder', 'Now 2.5');
  });

  it('creates the certificate details the first time, and needs the organisation name', async () => {
    const user = userEvent.setup();
    renderAt('/admin/settings?section=certificates');

    expect(await screen.findByText(/No certificate details have been saved yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('PBO number'), '930012345');
    await user.click(screen.getByRole('button', { name: 'Save certificate details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('organisation name is required');
    expect(api.saveCertificateSettings).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Organisation name'), 'Ladles of Love');
    await user.click(screen.getByRole('button', { name: 'Save certificate details' }));
    await waitFor(() => expect(api.saveCertificateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ organisationName: 'Ladles of Love', pboNumber: '930012345' }), { exists: false },
    ));
  });

  it('changes section from the email-integration address Google returns to', async () => {
    const user = userEvent.setup();
    renderAt('/admin/email-integration?gmail=connected', { defaultSection: 'email' });
    await user.click(screen.getByRole('tab', { name: 'Stock rules' }));
    // MemoryRouter: the new URL is reflected in the selected tab.
    expect(screen.getByRole('tab', { name: 'Stock rules' })).toHaveAttribute('aria-selected', 'true');
  });
});
