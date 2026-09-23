// ─────────────────────────────────────────────────────────────
// server/__tests__/collectionKit.controller.test.js
//
// Covers the one thing that broke silently: a 503 from
// collectionKit.service.js's runOrMissingTable (collection_kits /
// collection_kit_records not migrated yet) is meant to reach the
// screen as its actual, actionable message — "hasn't been set up
// yet... Run the pending migration" — not a generic fallback. The
// send() helper originally copied communityRequest.controller.js's
// plain "status < 500" rule, which treats 503 the same as a raw 500
// and throws the real message away. Fixed to match
// reporting.controller.js's own PASS_THROUGH convention, covered here
// so it can't regress silently again.
// ─────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = {
  createKit: vi.fn(), listKits: vi.fn(), getKit: vi.fn(), getRecord: vi.fn(),
  listRecords: vi.fn(), logCompost: vi.fn(), markDispatched: vi.fn(),
};
vi.mock('../src/services/collectionKit.service.js', () => ({ default: service }));
const controller = (await import('../src/controllers/collectionKit.controller.js')).default;

const response = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => vi.clearAllMocks());

describe('collectionKit.controller', () => {
  it('passes a 503\'s real message through, not the generic fallback', async () => {
    service.listRecords.mockRejectedValueOnce(
      withStatus(503, 'Feed the Soil kit tracking hasn\'t been set up yet — Run the pending migration for this feature.')
    );
    const res = response();

    await controller.listRecords({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: expect.stringMatching(/hasn't been set up yet/),
    });
  });

  it('hides a raw 500\'s message behind the fallback', async () => {
    service.listRecords.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    const res = response();

    await controller.listRecords({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to load compost records.',
    });
  });

  it('still shows a 4xx message as-is', async () => {
    service.logCompost.mockRejectedValueOnce(withStatus(404, 'Kit not found.'));
    const res = response();

    await controller.logCompost({ params: { id: 999 }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Kit not found.' });
  });
});
