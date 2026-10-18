// ─────────────────────────────────────────────────────────────
// server/__tests__/pendingDonation.mine.test.js
//
// GET /api/donations/pending/mine: a worker's own donations for their
// History on the floor. Scoped by the session's user, never by the
// request; a range the screen does not offer is refused.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = { listPendingDonationsByCreator: vi.fn() };
vi.mock('../src/repositories/pendingDonation.repository.js', () => ({ default: repoMock }));
vi.mock('../src/services/pendingDonation.service.js', () => ({ default: {} }));

const { default: controller } = await import('../src/controllers/pendingDonation.controller.js');

const res = () => {
  const r = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
};

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.listPendingDonationsByCreator.mockResolvedValue([{ id: 1 }]);
});

describe('listMyPendingDonations', () => {
  it('lists only the signed-in worker\'s donations, whatever the query says', async () => {
    const r = res();
    await controller.listMyPendingDonations({ user: { id: 7 }, query: { range: 'all', userId: '99' } }, r);
    expect(repoMock.listPendingDonationsByCreator).toHaveBeenCalledWith(7, { from: null });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }] });
  });

  it('turns a range into a start date', async () => {
    await controller.listMyPendingDonations({ user: { id: 7 }, query: { range: 'week' } }, res());
    const { from } = repoMock.listPendingDonationsByCreator.mock.calls[0][1];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses a range the screen does not offer', async () => {
    const r = res();
    await controller.listMyPendingDonations({ user: { id: 7 }, query: { range: 'year' } }, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(repoMock.listPendingDonationsByCreator).not.toHaveBeenCalled();
  });
});
