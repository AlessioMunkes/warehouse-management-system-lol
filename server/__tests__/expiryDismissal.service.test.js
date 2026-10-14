// ─────────────────────────────────────────────────────────────
// server/__tests__/expiryDismissal.service.test.js
//
// A manager dismissing, and restoring, the expiry warning for one
// delivery: a reason is required, the delivery has to be the product's
// own, a second dismissal is refused, and every change is audited in the
// same transaction as the change itself. The repositories are mocked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn() };
const withTransaction = vi.fn(async (work) => work(client));
vi.mock('../src/utils/transaction.js', () => ({ withTransaction }));

const repoMock = { findLine: vi.fn(), insert: vi.fn(), restore: vi.fn() };
vi.mock('../src/repositories/expiryDismissal.repository.js', () => ({ default: repoMock }));

const loadShelfLots = vi.fn();
vi.mock('../src/repositories/shelfLots.repository.js', () => ({ loadShelfLots }));

const logAudit = vi.fn();
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit }));

const { default: service, MAX_REASON_LENGTH } = await import('../src/services/expiryDismissal.service.js');

const LINE = { id: 8, product_id: 5, expiry_date: '2026-10-20', product_name: 'Maize meal' };
const LOT = { lineId: 8, expiryDate: '2026-10-20', received: 40, left: 12, unit: 'kg', dismissal: null };

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findLine.mockResolvedValue(LINE);
  repoMock.insert.mockResolvedValue({ id: 1, delivery_note_item_id: 8, reason: 'Used it all' });
  repoMock.restore.mockResolvedValue({ id: 1, delivery_note_item_id: 8, reason: 'Used it all', dismissed_by: 3 });
  loadShelfLots.mockResolvedValue(new Map([[5, { lots: [LOT] }]]));
});

const rejects = async (promise, status, message) => {
  await expect(promise).rejects.toMatchObject({ status, ...(message ? { message: expect.stringMatching(message) } : {}) });
};

describe('dismiss', () => {
  it('records the dismissal against the person, with the reason trimmed', async () => {
    await service.dismiss({ productId: '5', lineId: '8', reason: '  Used it all  ' }, 3);

    expect(repoMock.insert).toHaveBeenCalledWith(client, { lineId: 8, reason: 'Used it all', userId: 3 });
  });

  it('writes who, why and what the estimate said to the audit log, in the same transaction', async () => {
    await service.dismiss({ productId: 5, lineId: 8, reason: 'Used it all' }, 3);

    expect(logAudit).toHaveBeenCalledWith(client, {
      entityType: 'delivery_note_item_expiry',
      entityId: '8',
      action: 'expiry_warning_dismissed',
      actorId: 3,
      reason: 'Used it all',
      after: { productId: 5, productName: 'Maize meal', expiryDate: '2026-10-20', estimatedLeft: 12, received: 40, unit: 'kg' },
    });
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it('still dismisses a delivery the estimate has as used up', async () => {
    loadShelfLots.mockResolvedValue(new Map());
    await service.dismiss({ productId: 5, lineId: 8, reason: 'Found a pallet at the back' }, 3);

    expect(logAudit.mock.calls[0][1].after).toMatchObject({ estimatedLeft: null });
  });

  it.each([[undefined], [''], ['   '], [null]])('needs a reason (%j) and writes nothing without one', async (reason) => {
    await rejects(service.dismiss({ productId: 5, lineId: 8, reason }, 3), 400, /why/i);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(repoMock.insert).not.toHaveBeenCalled();
  });

  it('refuses a reason that is too long', async () => {
    await rejects(service.dismiss({ productId: 5, lineId: 8, reason: 'x'.repeat(MAX_REASON_LENGTH + 1) }, 3), 400, /500/);
    expect(repoMock.insert).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    await rejects(service.dismiss({ productId: 5, lineId: 8, reason: 'ok' }, undefined), 400);
    expect(repoMock.insert).not.toHaveBeenCalled();
  });

  it('refuses a delivery that is not this product\'s, does not exist, or has no use-by date', async () => {
    repoMock.findLine.mockResolvedValueOnce({ ...LINE, product_id: 9 });
    await rejects(service.dismiss({ productId: 5, lineId: 8, reason: 'ok' }, 3), 404);
    repoMock.findLine.mockResolvedValueOnce(null);
    await rejects(service.dismiss({ productId: 5, lineId: 8, reason: 'ok' }, 3), 404);
    repoMock.findLine.mockResolvedValueOnce({ ...LINE, expiry_date: null });
    await rejects(service.dismiss({ productId: 5, lineId: 8, reason: 'ok' }, 3), 404);
    expect(repoMock.insert).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('says so when the warning is already dismissed, and audits nothing', async () => {
    repoMock.insert.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await rejects(service.dismiss({ productId: 5, lineId: 8, reason: 'ok' }, 3), 409, /already dismissed/);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('lets any other database error through', async () => {
    repoMock.insert.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: '08006' }));

    await expect(service.dismiss({ productId: 5, lineId: 8, reason: 'ok' }, 3)).rejects.toThrow('connection lost');
  });
});

describe('restore', () => {
  it('brings the warning back and audits who did it', async () => {
    await service.restore({ productId: 5, lineId: 8 }, 4);

    expect(repoMock.restore).toHaveBeenCalledWith(client, { lineId: 8, userId: 4 });
    expect(logAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      entityId: '8', action: 'expiry_warning_restored', actorId: 4, reason: 'Used it all',
    }));
  });

  it('says so when there was nothing dismissed', async () => {
    repoMock.restore.mockResolvedValueOnce(null);

    await rejects(service.restore({ productId: 5, lineId: 8 }, 4), 409, /not dismissed/);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses a delivery that is not this product\'s', async () => {
    repoMock.findLine.mockResolvedValueOnce({ ...LINE, product_id: 9 });

    await rejects(service.restore({ productId: 5, lineId: 8 }, 4), 404);
    expect(repoMock.restore).not.toHaveBeenCalled();
  });
});
