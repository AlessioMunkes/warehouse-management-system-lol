// ─────────────────────────────────────────────────────────────
// server/__tests__/collectionKit.service.test.js
//
// collectionKit.repository.js is mocked, so these exercise the
// service's own validation for Feed the Soil kit logging: kitLabel is
// required, kg values must be non-negative numbers, an unknown/
// already-returned kit fails with the right status on markReturned.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listKits:     vi.fn(),
  logKitOut:    vi.fn(),
  markReturned: vi.fn(),
};
vi.mock('../src/repositories/collectionKit.repository.js', () => ({ default: repoMock }));

const { default: service } = await import('../src/services/collectionKit.service.js');

const ACTOR_ID = 5;

beforeEach(() => vi.clearAllMocks());

describe('logKitOut', () => {
  it('requires a kit label', async () => {
    await expect(service.logKitOut({ kgFoodWasteCollected: 10 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.logKitOut).not.toHaveBeenCalled();
  });

  it('rejects a negative kg value', async () => {
    await expect(service.logKitOut({ kitLabel: 'Bucket A1', kgFoodWasteCollected: -1 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('defaults dateOut to today and passes the actor as loggedBy', async () => {
    repoMock.logKitOut.mockResolvedValue({ id: 1, kit_label: 'Bucket A1' });

    await service.logKitOut({ kitLabel: 'Bucket A1', kgFoodWasteCollected: 12.5 }, ACTOR_ID);

    const call = repoMock.logKitOut.mock.calls[0][0];
    expect(call.kitLabel).toBe('Bucket A1');
    expect(call.kgFoodWasteCollected).toBe(12.5);
    expect(call.loggedBy).toBe(ACTOR_ID);
    expect(call.dateOut).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('treats blank optional fields as null, not empty strings', async () => {
    repoMock.logKitOut.mockResolvedValue({ id: 1 });
    await service.logKitOut({ kitLabel: 'Bucket A1', kgFoodWasteCollected: 5, location: '  ', notes: '' }, ACTOR_ID);
    const call = repoMock.logKitOut.mock.calls[0][0];
    expect(call.location).toBeNull();
    expect(call.notes).toBeNull();
  });
});

describe('markReturned', () => {
  it('rejects a non-integer id', async () => {
    await expect(service.markReturned('nope', { kgCompostReturned: 5 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a negative compost value', async () => {
    await expect(service.markReturned(1, { kgCompostReturned: -2 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('surfaces kit_not_found as 404', async () => {
    repoMock.markReturned.mockResolvedValue({ ok: false, code: 'kit_not_found' });
    await expect(service.markReturned(99, { kgCompostReturned: 5 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('surfaces already_returned as 409', async () => {
    repoMock.markReturned.mockResolvedValue({ ok: false, code: 'already_returned' });
    await expect(service.markReturned(1, { kgCompostReturned: 5 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 409 });
  });

  it('returns the updated kit on success', async () => {
    const kit = { id: 1, status: 'returned', kg_compost_returned: 5 };
    repoMock.markReturned.mockResolvedValue({ ok: true, kit });
    const result = await service.markReturned(1, { kgCompostReturned: 5 }, ACTOR_ID);
    expect(result).toEqual(kit);
  });
});

describe('listKits', () => {
  it('rejects an invalid status filter', async () => {
    await expect(service.listKits({ status: 'lost' })).rejects.toMatchObject({ status: 400 });
  });

  it('passes a valid status filter through', async () => {
    repoMock.listKits.mockResolvedValue([]);
    await service.listKits({ status: 'out' });
    expect(repoMock.listKits).toHaveBeenCalledWith({ status: 'out', limit: 100 });
  });
});
