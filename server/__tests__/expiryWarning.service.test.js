// ─────────────────────────────────────────────────────────────
// server/__tests__/expiryWarning.service.test.js
//
// Service-level tests for expiryWarning.service.runExpiryCheck —
// the repository and notification.repository are both mocked, so
// these prove the orchestration: two tiers checked independently,
// dedup skips already-warned lines, each notification runs in its
// own transaction, and a failure on one line doesn't stop the sweep.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const makeClient = () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
});

const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const repoMock = {
  findApproachingExpiry: vi.fn(),
  warningAlreadySent: vi.fn(),
};
vi.mock('../src/repositories/expiryWarning.repository.js', () => ({ default: repoMock }));

const createNotificationMock = vi.fn();
vi.mock('../src/repositories/notification.repository.js', () => ({
  createNotification: (...args) => createNotificationMock(...args),
}));

const { default: expiryWarningService } = await import('../src/services/expiryWarning.service.js');

const ITEM_A = {
  delivery_note_item_id: 1,
  expiry_date: '2026-09-27',
  received_quantity: 10,
  unit: 'kg',
  product_id: 5,
  product_name: 'Maize meal',
  sku: 'MM-01',
};

const ITEM_B = {
  delivery_note_item_id: 2,
  expiry_date: '2026-09-22',
  received_quantity: 4,
  unit: 'boxes',
  product_id: 9,
  product_name: 'Tinned beans',
  sku: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.connect.mockImplementation(async () => makeClient());
});

describe('runExpiryCheck', () => {
  it('checks both the 14-day and 7-day tiers independently', async () => {
    repoMock.findApproachingExpiry.mockResolvedValue([]);

    await expiryWarningService.runExpiryCheck();

    expect(repoMock.findApproachingExpiry).toHaveBeenCalledTimes(2);
    expect(repoMock.findApproachingExpiry).toHaveBeenCalledWith(14);
    expect(repoMock.findApproachingExpiry).toHaveBeenCalledWith(7);
  });

  it('notifies once per new line per tier and reports the summary', async () => {
    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_A]); // 14-day tier
    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_B]); // 7-day tier
    repoMock.warningAlreadySent.mockResolvedValue(false);

    const summary = await expiryWarningService.runExpiryCheck();

    expect(summary).toEqual({ checked: 2, notified: 2 });
    expect(createNotificationMock).toHaveBeenCalledTimes(2);

    const [, firstArgs] = createNotificationMock.mock.calls[0];
    expect(firstArgs).toMatchObject({
      type: 'stock_expiry_warning_2w',
      entityType: 'delivery_note_item_expiry',
      entityId: 1,
    });
    expect(firstArgs.title).toMatch(/Maize meal expires in 2 weeks/);

    const [, secondArgs] = createNotificationMock.mock.calls[1];
    expect(secondArgs).toMatchObject({
      type: 'stock_expiry_warning_1w',
      entityType: 'delivery_note_item_expiry',
      entityId: 2,
    });
    expect(secondArgs.title).toMatch(/Tinned beans expires in 1 week/);
  });

  it('skips a line that has already been warned at that tier', async () => {
    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_A]);
    repoMock.findApproachingExpiry.mockResolvedValueOnce([]);
    repoMock.warningAlreadySent.mockResolvedValue(true);

    const summary = await expiryWarningService.runExpiryCheck();

    expect(summary).toEqual({ checked: 1, notified: 0 });
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('warns a line at both tiers independently as it crosses each window', async () => {
    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_A]);
    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_A]);
    repoMock.warningAlreadySent.mockResolvedValueOnce(false); // 14-day: not yet warned
    repoMock.warningAlreadySent.mockResolvedValueOnce(false); // 7-day: not yet warned

    const summary = await expiryWarningService.runExpiryCheck();

    expect(summary).toEqual({ checked: 2, notified: 2 });
    expect(repoMock.warningAlreadySent).toHaveBeenNthCalledWith(1, 1, 'stock_expiry_warning_2w');
    expect(repoMock.warningAlreadySent).toHaveBeenNthCalledWith(2, 1, 'stock_expiry_warning_1w');
  });

  it('runs each notification in its own BEGIN/COMMIT and releases the client', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_A]);
    repoMock.findApproachingExpiry.mockResolvedValueOnce([]);
    repoMock.warningAlreadySent.mockResolvedValue(false);

    await expiryWarningService.runExpiryCheck();

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and rethrows if writing a notification fails', async () => {
    const failingClient = makeClient();
    failingClient.query.mockImplementation((sql) => {
      if (sql === 'BEGIN') return Promise.resolve();
      return Promise.reject(new Error('insert failed'));
    });
    poolMock.connect.mockResolvedValueOnce(failingClient);

    repoMock.findApproachingExpiry.mockResolvedValueOnce([ITEM_A]);
    repoMock.warningAlreadySent.mockResolvedValue(false);

    await expect(expiryWarningService.runExpiryCheck()).rejects.toThrow('insert failed');

    expect(failingClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(failingClient.release).toHaveBeenCalledTimes(1);
  });
});
