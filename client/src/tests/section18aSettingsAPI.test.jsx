import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

const { apiGet, apiPost, apiPut } = await import('../services/api');
const settingsAPI = await import('../services/section18aSettingsAPI');

const settings = {
  organisationName: 'Ladles of Love',
  pboNumber: '930000000',
  section18AReference: '18A-REF',
  contactEmail: 'finance@example.org',
  signatureName: 'Authorised Person',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('section18aSettingsAPI', () => {
  it('reads certificate settings through the shared authenticated API client', async () => {
    apiGet.mockResolvedValue({ success: true, data: settings });

    await expect(settingsAPI.getSettings()).resolves.toEqual(settings);

    expect(apiGet).toHaveBeenCalledWith('/api/certificate-settings');
  });

  it('updates settings with a single PUT when the singleton row exists', async () => {
    apiPut.mockResolvedValue({ success: true, data: settings });

    await expect(settingsAPI.updateSettings(settings)).resolves.toEqual(settings);

    expect(apiPut).toHaveBeenCalledWith('/api/certificate-settings', settings);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('falls back to create only when PUT returns 404', async () => {
    const missing = new Error('Not configured');
    missing.status = 404;
    apiPut.mockRejectedValue(missing);
    apiPost.mockResolvedValue({ success: true, data: settings });

    await expect(settingsAPI.saveSettings(settings)).resolves.toEqual(settings);

    expect(apiPut).toHaveBeenCalledWith('/api/certificate-settings', settings);
    expect(apiPost).toHaveBeenCalledWith('/api/certificate-settings', settings);
  });

  it('propagates failed PUT requests without duplicate submissions', async () => {
    const networkError = new Error('Could not reach the server.');
    networkError.isNetworkError = true;
    apiPut.mockRejectedValue(networkError);

    await expect(settingsAPI.updateSettings(settings)).rejects.toMatchObject({
      isNetworkError: true,
    });

    expect(apiPost).not.toHaveBeenCalled();
  });
});
