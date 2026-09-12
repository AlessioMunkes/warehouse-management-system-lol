import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CertificateSettings from '../features/donationManagement/components/CertificateSettings';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'manager' } }),
}));

vi.mock('../services/section18aSettingsAPI', () => ({
  getSettings: vi.fn(),
  createSettings: vi.fn(),
  updateSettings: vi.fn(),
  deleteSettings: vi.fn(),
}));

const api = await import('../services/section18aSettingsAPI');

const settings = {
  id: 1,
  organisationName: 'Ladles of Love',
  pboNumber: '930000000',
  section18AReference: '18A-REF',
  contactEmail: 'finance@example.org',
  signatureName: 'Authorised Person',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getSettings.mockResolvedValue(settings);
});

const editAndSave = async () => {
  const user = userEvent.setup();
  render(<CertificateSettings />);

  const orgInput = await screen.findByLabelText(/Organisation Name/i);
  await user.clear(orgInput);
  await user.type(orgInput, 'Ladles Updated');
  await user.click(screen.getByRole('button', { name: /Save/i }));
};

describe('CertificateSettings save loading state', () => {
  it('clears the Save loading state after a successful update', async () => {
    api.updateSettings.mockResolvedValue({ ...settings, organisationName: 'Ladles Updated' });

    await editAndSave();

    expect(await screen.findByText(/Certificate settings updated successfully/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Saving/i)).not.toBeInTheDocument());
  });

  it('clears the Save loading state after a failed update', async () => {
    api.updateSettings.mockRejectedValue(new Error('Database unavailable'));

    await editAndSave();

    expect(await screen.findByText(/Database unavailable/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Saving/i)).not.toBeInTheDocument());
  });
});
