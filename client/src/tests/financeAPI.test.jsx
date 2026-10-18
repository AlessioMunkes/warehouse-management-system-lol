import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = {
  apiGet: vi.fn(),
  apiPost: vi.fn(),
};

vi.mock('../services/api', () => apiMock);

const { getFinanceReport, getPublicFinanceReport } = await import('../services/financeAPI');

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.apiGet.mockResolvedValue({ data: { movements: [] } });
  apiMock.apiPost.mockResolvedValue({ data: {} });
});

describe('financeAPI', () => {
  it('calls the finance report endpoint without empty filters', async () => {
    await getFinanceReport({
      from: '2026-09-01',
      to: '2026-09-20',
      limit: 200,
      movementType: '',
    });

    expect(apiMock.apiGet).toHaveBeenCalledWith(
      '/api/finance/report?from=2026-09-01&to=2026-09-20&limit=200',
    );
  });

  it('calls the public tokenized finance report endpoint', async () => {
    await getPublicFinanceReport('token/with symbols', {
      from: '2026-09-01',
      limit: 200,
    });

    expect(apiMock.apiGet).toHaveBeenCalledWith(
      '/api/finance/public/token%2Fwith%20symbols/report?from=2026-09-01&limit=200',
    );
  });

  it('saves and sends Finance email settings through the Finance API', async () => {
    const api = await import('../services/financeAPI');

    await api.saveFinanceEmailSettings({ recipientEmail: 'finance@example.org' });
    expect(apiMock.apiPost).toHaveBeenCalledWith('/api/finance/email-settings', {
      recipientEmail: 'finance@example.org',
    });

    await api.sendFinanceReportLink();
    expect(apiMock.apiPost).toHaveBeenCalledWith('/api/finance/report-link/send', {});
  });
});
