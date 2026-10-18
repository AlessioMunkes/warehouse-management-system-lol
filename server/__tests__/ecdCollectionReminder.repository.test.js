import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repository } = await import('../src/repositories/ecdCollectionReminder.repository.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ecdCollectionReminder.repository', () => {
  it('reads tomorrow collections from ECD picking slips only', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    await repository.findCollectionsByDate('2026-09-24');

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM picking_slips ps/i);
    expect(sql).toMatch(/JOIN ecd_centres e ON e\.id = ps\.ecd_id/i);
    expect(sql).toMatch(/e\.contact_email/i);
    expect(sql).toMatch(/ps\.dispatch_date = \$1::date/i);
    expect(sql).toMatch(/ps\.status <> 'cancelled'/i);
    expect(params).toEqual(['2026-09-24']);
  });

  it('inserts reminder records idempotently by ECD, date, and channel', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });

    const result = await repository.createReminderOnce({
      ecdId: 1,
      collectionDate: '2026-09-24',
      channel: 'sms',
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO ecd_collection_reminders/i);
    expect(sql).toMatch(/ON CONFLICT \(ecd_id, collection_date, channel\) DO NOTHING/i);
    expect(params).toEqual([1, '2026-09-24', 'sms', 'pending']);
    expect(result).toEqual({ id: 7 });
  });

  it('returns null when the reminder already exists', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    await expect(repository.createReminderOnce({
      ecdId: 1,
      collectionDate: '2026-09-24',
      channel: 'sms',
    })).resolves.toBeNull();
  });

  it('lists pending reminder deliveries for a collection date and channel', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    await repository.listPendingReminderDeliveries({
      collectionDate: '2026-09-24',
      channel: 'email',
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM ecd_collection_reminders r/i);
    expect(sql).toMatch(/JOIN ecd_centres e ON e\.id = r\.ecd_id/i);
    expect(sql).toMatch(/r\.status = 'pending'/i);
    expect(sql).toMatch(/e\.contact_email/i);
    expect(params).toEqual(['2026-09-24', 'email']);
  });

  it('lists reminder deliveries for API views regardless of status', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    await repository.listReminderDeliveries({
      collectionDate: '2026-09-24',
      channel: 'whatsapp',
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM ecd_collection_reminders r/i);
    expect(sql).toMatch(/JOIN ecd_centres e ON e\.id = r\.ecd_id/i);
    expect(sql).toMatch(/r\.collection_date = \$1::date/i);
    expect(sql).toMatch(/r\.channel = \$2/i);
    expect(sql).not.toMatch(/r\.status = 'pending'/i);
    expect(sql).toMatch(/e\.mobile_number/i);
    expect(params).toEqual(['2026-09-24', 'whatsapp']);
  });

  it('gets one reminder delivery with beneficiary contact fields', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 10 }] });

    const result = await repository.getReminderDeliveryById(10);

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM ecd_collection_reminders r/i);
    expect(sql).toMatch(/JOIN ecd_centres e ON e\.id = r\.ecd_id/i);
    expect(sql).toMatch(/WHERE r\.id = \$1/i);
    expect(sql).toMatch(/e\.mobile_number/i);
    expect(params).toEqual([10]);
    expect(result).toEqual({ id: 10 });
  });

  it('claims pending reminders before sending to prevent duplicate sends', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'sending' }] });

    const result = await repository.claimReminderForSending(10);

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/SET status = 'sending'/i);
    expect(sql).toMatch(/WHERE id = \$1\s+AND status = 'pending'/i);
    expect(params).toEqual([10]);
    expect(result).toEqual({ id: 10, status: 'sending' });
  });

  it('marks sent reminders with provider message id and sent_at', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'sent' }] });

    await repository.markReminderSent({ id: 10, providerMessageId: 'gmail-1' });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/SET status = 'sent'/i);
    expect(sql).toMatch(/sent_at = NOW\(\)/i);
    expect(sql).toMatch(/provider_message_id = \$2/i);
    expect(sql).toMatch(/status <> 'sent'/i);
    expect(params).toEqual([10, 'gmail-1']);
  });

  it('marks failed reminders with the provider error', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'failed' }] });

    await repository.markReminderFailed({ id: 10, errorMessage: 'Gmail down' });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/SET status = 'failed'/i);
    expect(sql).toMatch(/error_message = \$2/i);
    expect(sql).toMatch(/status <> 'sent'/i);
    expect(params).toEqual([10, 'Gmail down']);
  });
});
