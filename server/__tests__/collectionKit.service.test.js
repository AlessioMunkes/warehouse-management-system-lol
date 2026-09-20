// ─────────────────────────────────────────────────────────────
// server/__tests__/collectionKit.service.test.js
//
// collectionKit.repository.js is mocked, so these exercise the
// service's own validation for Feed the Soil kit tracking: ownerName
// is required to assign a kit, kgCompost must be a non-negative
// number to log compost, an unknown kit/record fails with the right
// status, and a 42P01 from any path becomes a 503.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  createKit:      vi.fn(),
  listKits:       vi.fn(),
  getKitById:     vi.fn(),
  logCompost:     vi.fn(),
  markDispatched: vi.fn(),
  listRecords:    vi.fn(),
};
vi.mock('../src/repositories/collectionKit.repository.js', () => ({ default: repoMock }));

const { default: service } = await import('../src/services/collectionKit.service.js');

const ACTOR_ID = 5;
const missingTableError = () => Object.assign(new Error('relation does not exist'), { code: '42P01' });

beforeEach(() => vi.clearAllMocks());

describe('createKit', () => {
  it('requires an owner name', async () => {
    await expect(service.createKit({ suburb: 'Delft' }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.createKit).not.toHaveBeenCalled();
  });

  it('defaults assignedAt to today and passes the owner/suburb through', async () => {
    repoMock.createKit.mockResolvedValue({ id: 1, owner_name: 'Jane M.' });

    await service.createKit({ ownerName: 'Jane M.', suburb: 'Delft' }, ACTOR_ID);

    const call = repoMock.createKit.mock.calls[0][0];
    expect(call.ownerName).toBe('Jane M.');
    expect(call.suburb).toBe('Delft');
    expect(call.actorId).toBe(ACTOR_ID);
    expect(call.assignedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('treats a blank suburb as null, not an empty string', async () => {
    repoMock.createKit.mockResolvedValue({ id: 1 });
    await service.createKit({ ownerName: 'Jane M.', suburb: '  ' }, ACTOR_ID);
    expect(repoMock.createKit.mock.calls[0][0].suburb).toBeNull();
  });

  it('surfaces a missing table as a 503, not a raw 500', async () => {
    repoMock.createKit.mockRejectedValue(missingTableError());
    await expect(service.createKit({ ownerName: 'Jane M.' }, ACTOR_ID))
      .rejects.toMatchObject({ status: 503 });
  });
});

describe('getKit', () => {
  it('rejects a non-numeric id', async () => {
    await expect(service.getKit('abc')).rejects.toMatchObject({ status: 400 });
  });

  it('404s when the repository finds nothing', async () => {
    repoMock.getKitById.mockResolvedValue(null);
    await expect(service.getKit(999)).rejects.toMatchObject({ status: 404 });
  });

  it('returns the kit with its record history', async () => {
    const kit = { id: 1, owner_name: 'Jane M.', status: 'logged', records: [] };
    repoMock.getKitById.mockResolvedValue(kit);
    await expect(service.getKit(1)).resolves.toEqual(kit);
  });
});

describe('logCompost', () => {
  it('rejects a non-numeric kit id', async () => {
    await expect(service.logCompost('abc', { kgCompost: 5 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a negative kg value', async () => {
    await expect(service.logCompost(1, { kgCompost: -1 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('404s when the kit does not exist', async () => {
    repoMock.logCompost.mockResolvedValue({ ok: false, code: 'kit_not_found' });
    await expect(service.logCompost(999, { kgCompost: 5 }, ACTOR_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('defaults loggedAt to today and returns the created record', async () => {
    const record = { id: 1, kit_id: 1, kg_compost: 5, status: 'logged' };
    repoMock.logCompost.mockResolvedValue({ ok: true, record });

    const result = await service.logCompost(1, { kgCompost: 5 }, ACTOR_ID);

    expect(result).toEqual(record);
    const call = repoMock.logCompost.mock.calls[0][0];
    expect(call.loggedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.actorId).toBe(ACTOR_ID);
  });
});

describe('markDispatched', () => {
  it('rejects a non-numeric record id', async () => {
    await expect(service.markDispatched('abc', ACTOR_ID)).rejects.toMatchObject({ status: 400 });
  });

  it('404s when the record does not exist', async () => {
    repoMock.markDispatched.mockResolvedValue({ ok: false, code: 'record_not_found' });
    await expect(service.markDispatched(999, ACTOR_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('409s when the record is already dispatched', async () => {
    repoMock.markDispatched.mockResolvedValue({ ok: false, code: 'already_dispatched' });
    await expect(service.markDispatched(1, ACTOR_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('returns the updated record on success', async () => {
    const record = { id: 1, status: 'dispatched' };
    repoMock.markDispatched.mockResolvedValue({ ok: true, record });
    await expect(service.markDispatched(1, ACTOR_ID)).resolves.toEqual(record);
  });
});

describe('listRecords', () => {
  it('rejects an invalid status filter', async () => {
    await expect(service.listRecords({ status: 'out' })).rejects.toMatchObject({ status: 400 });
  });

  it('accepts logged and dispatched as the only valid filters', async () => {
    repoMock.listRecords.mockResolvedValue([]);
    await service.listRecords({ status: 'logged' });
    expect(repoMock.listRecords).toHaveBeenCalledWith({ status: 'logged', limit: 200 });
  });
});

describe('listKits', () => {
  it('passes a search term through', async () => {
    repoMock.listKits.mockResolvedValue([]);
    await service.listKits({ search: 'Delft' });
    expect(repoMock.listKits).toHaveBeenCalledWith({ search: 'Delft' });
  });
});
