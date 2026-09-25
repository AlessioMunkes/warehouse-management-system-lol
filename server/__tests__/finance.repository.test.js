import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = {
  query: vi.fn(),
};

vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: financeRepository } = await import('../src/repositories/finance.repository.js');

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockResolvedValue({ rows: [] });
});

describe('financeRepository.listFinanceMovements', () => {
  it('reads from stock_movements and joins existing receipt, donation and dispatch records', async () => {
    await financeRepository.listFinanceMovements();

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM stock_movements sm/);
    expect(sql).toMatch(/LEFT JOIN delivery_notes dn/);
    expect(sql).toMatch(/JOIN purchase_order_items poi/);
    expect(sql).toMatch(/LEFT JOIN donations d/);
    expect(sql).toMatch(/LEFT JOIN dispatch_events de/);
    expect(sql).toMatch(/LEFT JOIN picking_slips ps/);
    expect(sql).not.toMatch(/province/i);
    expect(params).toEqual([['received', 'donated', 'dispatched'], 200]);
  });

  it('derives PO values from purchase order rows and leaves donation/dispatch movement values null', async () => {
    await financeRepository.listFinanceMovements();

    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/sm\.quantity \* po_line\.unit_price/);
    expect(sql).toMatch(/WHEN 'donated' THEN NULL::numeric/);
    expect(sql).toMatch(/ELSE NULL::numeric/);
  });

  it('reads donation values directly from donation_items without stock movement product matching', async () => {
    await financeRepository.listDonationValues({ from: '2026-09-01', to: '2026-09-30', limit: 25 });

    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM donation_items di/);
    expect(sql).toMatch(/JOIN donations d ON d\.id = di\.donation_id/);
    expect(sql).toMatch(/di\.estimated_value_zar IS NOT NULL/);
    expect(sql).not.toMatch(/stock_movements/);
    expect(sql).not.toMatch(/di\.product_id = sm\.product_id/);
    expect(sql).not.toMatch(/di\.quantity = sm\.quantity/);
    expect(poolMock.query.mock.calls[0][1]).toEqual(['2026-09-01', '2026-09-30', 25]);
  });

  it('totals all non-null donation item estimates within donation date filters', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ total: '22460.00' }] });

    await expect(financeRepository.getDonationValueTotal({ from: '2026-09-01', to: '2026-09-30' }))
      .resolves.toBe('22460.00');

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/SUM\(di\.estimated_value_zar\)/);
    expect(sql).toMatch(/di\.estimated_value_zar IS NOT NULL/);
    expect(sql).toMatch(/JOIN donations d ON d\.id = di\.donation_id/);
    expect(sql).not.toMatch(/stock_movements/);
    expect(params).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('applies date filters in the warehouse calendar and preserves the caller limit', async () => {
    await financeRepository.listFinanceMovements({
      from: '2026-09-01',
      to: '2026-09-20',
      movementTypes: ['received'],
      limit: 50,
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/Africa\/Johannesburg/);
    expect(params).toEqual([
      ['received'],
      '2026-09-01',
      '2026-09-20',
      50,
    ]);
  });
});

describe('financeRepository report links', () => {
  it('regenerates by revoking active links before inserting a new token hash', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    poolMock.connect = vi.fn().mockResolvedValue({ query, release });

    await financeRepository.createReportAccessLink({ tokenHash: 'abc123', createdBy: 9 });

    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[1][0]).toMatch(/UPDATE finance_report_access_links/);
    expect(query.mock.calls[1][1]).toEqual([9]);
    expect(query.mock.calls[2][0]).toMatch(/INSERT INTO finance_report_access_links/);
    expect(query.mock.calls[2][1]).toEqual(['abc123', 9]);
    expect(query.mock.calls[3][0]).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('revokes active links without needing the plain token', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });

    await expect(financeRepository.revokeReportAccessLinks({ revokedBy: 4 }))
      .resolves.toEqual({ revokedCount: 2 });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/revoked_at = NOW\(\)/);
    expect(sql).toMatch(/WHERE revoked_at IS NULL/);
    expect(params).toEqual([4]);
  });

  it('looks up public links by token hash only', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await financeRepository.getActiveReportAccessLinkByHash('hash-only');

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/WHERE token_hash = \$1/);
    expect(sql).toMatch(/revoked_at IS NULL/);
    expect(params).toEqual(['hash-only']);
  });
});

describe('financeRepository email settings and logs', () => {
  it('saves the finance recipient email in the singleton settings row', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ recipient_email: 'finance@example.org' }] });

    await financeRepository.saveEmailSettings({ recipientEmail: 'finance@example.org', updatedBy: 9 });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/finance_report_email_settings/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(params).toEqual(['finance@example.org', 9]);
  });

  it('logs finance report email attempts as SENT or FAILED', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'SENT' }] });

    await financeRepository.logFinanceReportEmail({
      recipientEmail: 'finance@example.org',
      status: 'SENT',
      financeLinkId: 3,
      providerMessageId: 'gmail-1',
      sentByUserId: 9,
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/finance_report_email_logs/);
    expect(sql).toMatch(/CASE WHEN \$2 = 'SENT' THEN NOW\(\) ELSE NULL END/);
    expect(params).toEqual(['finance@example.org', 'SENT', 3, 'gmail-1', null, 9]);
  });
});
