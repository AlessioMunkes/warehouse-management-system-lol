import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMock = {
  FINANCE_MOVEMENT_TYPES: ['received', 'donated', 'dispatched'],
  listFinanceMovements: vi.fn(),
  listDonationValues: vi.fn(),
  getDonationValueTotal: vi.fn(),
  createReportAccessLink: vi.fn(),
  revokeReportAccessLinks: vi.fn(),
  getActiveReportAccessLinkByHash: vi.fn(),
  getEmailSettings: vi.fn(),
  saveEmailSettings: vi.fn(),
  logFinanceReportEmail: vi.fn(),
};

vi.mock('../src/repositories/finance.repository.js', () => ({ default: repoMock }));

const emailProviderMock = {
  sendEmail: vi.fn(),
};

vi.mock('../src/providers/email.provider.js', () => ({ default: emailProviderMock }));

const { default: financeService } = await import('../src/services/finance.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.listFinanceMovements.mockResolvedValue([]);
  repoMock.listDonationValues.mockResolvedValue([]);
  repoMock.getDonationValueTotal.mockResolvedValue('0');
  repoMock.createReportAccessLink.mockResolvedValue({ id: 1, created_by: 9 });
  repoMock.revokeReportAccessLinks.mockResolvedValue({ revokedCount: 1 });
  repoMock.getActiveReportAccessLinkByHash.mockResolvedValue({ id: 1 });
  repoMock.getEmailSettings.mockResolvedValue({ recipient_email: 'finance@example.org' });
  repoMock.saveEmailSettings.mockResolvedValue({
    recipient_email: 'finance@example.org',
    updated_by: 9,
    updated_at: '2026-09-20T10:00:00Z',
  });
  repoMock.logFinanceReportEmail.mockResolvedValue({ id: 12 });
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'gmail-1' });
});

describe('financeService.getFinanceSummary', () => {
  it('defaults to the three finance-safe movement types', async () => {
    await financeService.getFinanceSummary({});

    expect(repoMock.listFinanceMovements).toHaveBeenCalledWith({
      from: null,
      to: null,
      movementTypes: ['received', 'donated', 'dispatched'],
      limit: 200,
    });
    expect(repoMock.listDonationValues).toHaveBeenCalledWith({
      from: null,
      to: null,
      limit: 500,
    });
    expect(repoMock.getDonationValueTotal).toHaveBeenCalledWith({
      from: null,
      to: null,
    });
  });

  it('passes calendar dates through unparsed', async () => {
    await financeService.getFinanceSummary({ from: '2026-09-01', to: '2026-09-20' });

    expect(repoMock.listFinanceMovements.mock.calls[0][0]).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-20',
    });
  });

  it('accepts a comma-separated subset of supported movement types', async () => {
    await financeService.getFinanceSummary({ movementType: 'received,dispatched' });

    expect(repoMock.listFinanceMovements.mock.calls[0][0].movementTypes)
      .toEqual(['received', 'dispatched']);
  });

  it('rejects finance-unsafe movement types', async () => {
    await expect(financeService.getFinanceSummary({ movementType: 'wastage' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects malformed dates and inverted ranges', async () => {
    await expect(financeService.getFinanceSummary({ from: '20/09/2026' }))
      .rejects.toMatchObject({ status: 400 });

    await expect(financeService.getFinanceSummary({ from: '2026-09-20', to: '2026-09-01' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('returns movements without adding finance totals', async () => {
    const movements = [
      {
        movement_type: 'dispatched',
        reference_id: '44',
        monetary_value: null,
      },
    ];
    repoMock.listFinanceMovements.mockResolvedValue(movements);

    await expect(financeService.getFinanceSummary({})).resolves.toEqual({
      movements,
      donationValues: [],
      totals: { donations: '0' },
    });
  });

  it('returns donation item values and donation totals separately from stock movements', async () => {
    const donationValues = [
      { movement_type: 'donated', reference_id: '10', monetary_value: '22460.00' },
    ];
    repoMock.listDonationValues.mockResolvedValue(donationValues);
    repoMock.getDonationValueTotal.mockResolvedValue('22460.00');

    await expect(financeService.getFinanceSummary({ movementType: 'donated' })).resolves.toEqual({
      movements: [],
      donationValues,
      totals: { donations: '22460.00' },
    });
  });

  it('does not read donation item values when donations are filtered out', async () => {
    await financeService.getFinanceSummary({ movementType: 'received,dispatched' });

    expect(repoMock.listDonationValues).not.toHaveBeenCalled();
    expect(repoMock.getDonationValueTotal).not.toHaveBeenCalled();
  });
});

describe('financeService email settings and send', () => {
  it('returns saved finance recipient settings', async () => {
    await expect(financeService.getEmailSettings()).resolves.toMatchObject({
      recipientEmail: 'finance@example.org',
    });
  });

  it('validates and saves the finance recipient email', async () => {
    await financeService.saveEmailSettings({ recipientEmail: ' finance@example.org ', updatedBy: 9 });

    expect(repoMock.saveEmailSettings).toHaveBeenCalledWith({
      recipientEmail: 'finance@example.org',
      updatedBy: 9,
    });
  });

  it('rejects an invalid finance recipient email', async () => {
    await expect(financeService.saveEmailSettings({ recipientEmail: 'not-email', updatedBy: 9 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('regenerates a secure link, sends it, and logs SENT', async () => {
    const result = await financeService.sendFinanceReportLink({ sentBy: 9 });

    expect(emailProviderMock.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'finance@example.org',
        subject: 'Warehouse Finance Report Link',
        text: expect.stringContaining('/finance/report/'),
      }),
      9,
    );
    expect(repoMock.logFinanceReportEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'finance@example.org',
      status: 'SENT',
      financeLinkId: 1,
      providerMessageId: 'gmail-1',
      sentByUserId: 9,
    }));
    expect(result).toMatchObject({ sent: true, recipientEmail: 'finance@example.org', messageId: 'gmail-1' });
  });

  it('logs FAILED when the email provider cannot send', async () => {
    emailProviderMock.sendEmail.mockResolvedValueOnce({ sent: false, error: 'Gmail down' });
    repoMock.logFinanceReportEmail.mockResolvedValueOnce({ id: 13, error_message: 'Gmail down' });

    await expect(financeService.sendFinanceReportLink({ sentBy: 9 }))
      .rejects.toMatchObject({ status: 502 });

    expect(repoMock.logFinanceReportEmail).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FAILED',
      errorMessage: 'Gmail down',
    }));
  });

  it('requires a saved finance recipient before sending', async () => {
    repoMock.getEmailSettings.mockResolvedValueOnce({ recipient_email: null });

    await expect(financeService.sendFinanceReportLink({ sentBy: 9 }))
      .rejects.toMatchObject({ status: 400 });

    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });
});

describe('financeService report links', () => {
  it('generates a secure token but stores only its hash', async () => {
    const result = await financeService.regenerateReportLink({ createdBy: 9 });

    expect(result.token).toBeTypeOf('string');
    expect(result.token.length).toBeGreaterThan(32);
    expect(result.publicPath).toBe(`/api/finance/public/${result.token}/report`);

    const call = repoMock.createReportAccessLink.mock.calls[0][0];
    expect(call.createdBy).toBe(9);
    expect(call.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(call.tokenHash).not.toBe(result.token);
  });

  it('revokes active report links through the repository', async () => {
    await expect(financeService.revokeReportLink({ revokedBy: 7 }))
      .resolves.toEqual({ revokedCount: 1 });
    expect(repoMock.revokeReportAccessLinks).toHaveBeenCalledWith({ revokedBy: 7 });
  });

  it('uses the same finance summary for a valid public token', async () => {
    repoMock.listFinanceMovements.mockResolvedValue([{ movement_type: 'received' }]);

    const result = await financeService.getPublicFinanceSummary('abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-', {
      movementType: 'received',
    });

    expect(repoMock.getActiveReportAccessLinkByHash.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(result.movements).toEqual([{ movement_type: 'received' }]);
    expect(repoMock.listFinanceMovements.mock.calls[0][0].movementTypes).toEqual(['received']);
  });

  it('rejects malformed or revoked public tokens without reading report data', async () => {
    await expect(financeService.getPublicFinanceSummary('bad token', {}))
      .rejects.toMatchObject({ status: 404 });

    repoMock.getActiveReportAccessLinkByHash.mockResolvedValueOnce(null);
    await expect(financeService.getPublicFinanceSummary('abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-', {}))
      .rejects.toMatchObject({ status: 404 });
  });
});
