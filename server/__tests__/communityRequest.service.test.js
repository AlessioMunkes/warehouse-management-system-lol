// ─────────────────────────────────────────────────────────────
// server/__tests__/communityRequest.service.test.js
//
// communityRequest.repository.js is mocked, so these exercise the
// service's own rules for the ADM-5.0 / BR-28 call-in log, against the
// REAL live community_requests columns: what was requested is
// required, the quantity is a free-text note (no numeric rule), caller
// fields are optional and '' means "not recorded", claim and resolve
// are separate steps, and a resolve outcome must be one of the three
// in-scope values — not 'pending' (the start state) and not 'referred'
// (a DB enum value the URS keeps out of scope).
//
// withTransaction runs for real against a faked pool client (same
// approach as volunteerBooking.service.test.js) — the repository is
// mocked, so the client it receives is inert.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listRequests:   vi.fn(),
  getRequestById: vi.fn(),
  createRequest:  vi.fn(),
  claimRequest:   vi.fn(),
  resolveRequest: vi.fn(),
  countPending:   vi.fn(),
};
vi.mock('../src/repositories/communityRequest.repository.js', () => ({ default: repoMock }));

const makeClient = () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: service } = await import('../src/services/communityRequest.service.js');

const ACTOR = { id: 7 };

const requestRow = (over = {}) => ({
  id: 1,
  requested_at: '2026-09-10T09:00:00.000Z',
  caller_name: 'Sister Agnes',
  caller_contact: '021 555 0777',
  items_requested: 'Samp, sugar beans, cooking oil',
  quantity_note: 'Enough for roughly 80 plates',
  outcome: 'pending',
  outcome_note: null,
  handled_by: null,
  resolved_at: null,
  created_at: '2026-09-10T09:00:00.000Z',
  handled_by_first_name: null,
  handled_by_last_name: null,
  ...over,
});

const body = (over = {}) => ({
  itemsRequested: 'Samp, sugar beans, cooking oil',
  callerName: 'Sister Agnes',
  callerContact: '021 555 0777',
  quantityNote: 'Enough for roughly 80 plates',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.connect.mockResolvedValue(makeClient());
  repoMock.createRequest.mockResolvedValue(requestRow());
  repoMock.claimRequest.mockResolvedValue(requestRow({ handled_by: 7 }));
  repoMock.resolveRequest.mockResolvedValue(requestRow({ outcome: 'fulfilled', outcome_note: 'Packed a parcel', resolved_at: '2026-09-11T09:00:00.000Z' }));
  repoMock.getRequestById.mockResolvedValue(requestRow());
  repoMock.listRequests.mockResolvedValue([]);
  repoMock.countPending.mockResolvedValue(2);
});

describe('createRequest', () => {
  it('requires a description of what was requested', async () => {
    await expect(service.createRequest(body({ itemsRequested: '   ' }), ACTOR))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.createRequest).not.toHaveBeenCalled();
  });

  it('requires an authenticated actor (BR-01)', async () => {
    await expect(service.createRequest(body(), null)).rejects.toMatchObject({ status: 400 });
    await expect(service.createRequest(body(), {})).rejects.toMatchObject({ status: 400 });
  });

  it('takes the quantity note as free text, with no numeric validation', async () => {
    await service.createRequest(body({ quantityNote: 'a couple of trays, roughly' }), ACTOR);
    expect(repoMock.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ quantityNote: 'a couple of trays, roughly' }),
      expect.anything(),
    );
  });

  it('maps blank caller fields and a blank quantity note to null', async () => {
    await service.createRequest(
      { itemsRequested: 'Blankets', callerName: '  ', callerContact: '', quantityNote: '' },
      ACTOR,
    );
    expect(repoMock.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ callerName: null, callerContact: null, quantityNote: null }),
      expect.anything(),
    );
  });

  it('passes a valid requested-at timestamp through as ISO', async () => {
    await service.createRequest(body({ requestedAt: '2026-09-10T11:30' }), ACTOR);
    const arg = repoMock.createRequest.mock.calls[0][0];
    expect(new Date(arg.requestedAt).toISOString()).toBe(arg.requestedAt);
  });

  it('rejects an unparseable requested-at', async () => {
    await expect(service.createRequest(body({ requestedAt: 'last Tuesday' }), ACTOR))
      .rejects.toMatchObject({ status: 400 });
  });

  it('does not send an outcome — a new request starts pending at the DB default', async () => {
    await service.createRequest(body(), ACTOR);
    const arg = repoMock.createRequest.mock.calls[0][0];
    expect(arg).not.toHaveProperty('outcome');
  });
});

describe('claim', () => {
  it('sets handled_by to the acting user', async () => {
    const result = await service.claim(1, ACTOR);
    expect(result.handled_by).toBe(7);
    expect(repoMock.claimRequest).toHaveBeenCalledWith(1, 7, expect.anything());
  });

  it('requires an authenticated actor', async () => {
    await expect(service.claim(1, null)).rejects.toMatchObject({ status: 400 });
    expect(repoMock.claimRequest).not.toHaveBeenCalled();
  });

  it('404s when the row does not exist', async () => {
    repoMock.claimRequest.mockResolvedValue(null);
    await expect(service.claim(999, ACTOR)).rejects.toMatchObject({ status: 404 });
  });
});

describe('resolve', () => {
  it('rejects pending — that is the start state, not a resolution', async () => {
    await expect(service.resolve(1, { outcome: 'pending', outcomeNote: 'x' }, ACTOR))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.resolveRequest).not.toHaveBeenCalled();
  });

  it('rejects referred — a DB enum value the URS keeps out of scope', async () => {
    await expect(service.resolve(1, { outcome: 'referred', outcomeNote: 'sent to SASSA' }, ACTOR))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown outcome', async () => {
    await expect(service.resolve(1, { outcome: 'cancelled', outcomeNote: 'x' }, ACTOR))
      .rejects.toMatchObject({ status: 400 });
  });

  it.each(['fulfilled', 'partially_fulfilled', 'declined'])('accepts %s with a note', async (outcome) => {
    await service.resolve(1, { outcome, outcomeNote: 'Handled at the gate' }, ACTOR);
    expect(repoMock.resolveRequest).toHaveBeenCalledWith(
      1, { outcome, outcomeNote: 'Handled at the gate' }, expect.anything(),
    );
  });

  it('does not require a note — resolves with none, storing null', async () => {
    await service.resolve(1, { outcome: 'fulfilled' }, ACTOR);
    expect(repoMock.resolveRequest).toHaveBeenCalledWith(
      1, { outcome: 'fulfilled', outcomeNote: null }, expect.anything(),
    );
  });

  it('treats a whitespace-only note as null', async () => {
    await service.resolve(1, { outcome: 'declined', outcomeNote: '   ' }, ACTOR);
    expect(repoMock.resolveRequest).toHaveBeenCalledWith(
      1, { outcome: 'declined', outcomeNote: null }, expect.anything(),
    );
  });

  it('does not touch handled_by (resolve payload carries only outcome + note)', async () => {
    await service.resolve(1, { outcome: 'declined', outcomeNote: 'No stock available' }, ACTOR);
    const [, patch] = repoMock.resolveRequest.mock.calls[0];
    expect(Object.keys(patch).sort()).toEqual(['outcome', 'outcomeNote']);
  });

  it('404s when the row does not exist', async () => {
    repoMock.resolveRequest.mockResolvedValue(null);
    await expect(service.resolve(999, { outcome: 'declined', outcomeNote: 'gone' }, ACTOR))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('listRequests', () => {
  it('passes a valid outcome filter and a trimmed search through', async () => {
    await service.listRequests({ outcome: 'declined', search: '  parcel ' });
    expect(repoMock.listRequests).toHaveBeenCalledWith({ outcome: 'declined', search: 'parcel' });
  });

  it('allows referred as a filter value even though it cannot be a resolve target', async () => {
    await service.listRequests({ outcome: 'referred' });
    expect(repoMock.listRequests).toHaveBeenCalledWith({ outcome: 'referred', search: null });
  });

  it('rejects an outcome filter outside the enum', async () => {
    await expect(service.listRequests({ outcome: 'nope' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('normalises a blank search to null', async () => {
    await service.listRequests({ search: '   ' });
    expect(repoMock.listRequests).toHaveBeenCalledWith({ outcome: null, search: null });
  });
});

describe('getRequest', () => {
  it('404s when nothing is found', async () => {
    repoMock.getRequestById.mockResolvedValue(null);
    await expect(service.getRequest(9)).rejects.toMatchObject({ status: 404 });
  });
});

describe('countPending', () => {
  it('returns the repository count as a number', async () => {
    await expect(service.countPending()).resolves.toBe(2);
  });
});
