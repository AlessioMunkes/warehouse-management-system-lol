// ─────────────────────────────────────────────────────────────
// server/__tests__/dispatch.service.test.js
//
// dispatch.repository.js is mocked, so these tests exercise the
// service's own rules. The focus is the two things that had no
// coverage at all and were both wrong:
//
//   1. TIME. The server runs in UTC and the warehouse is in Cape
//      Town (UTC+2). Every test here sets the system clock to a
//      specific UTC instant and asserts the answer the warehouse
//      would give, which is the only way to catch this class of bug
//      — the old code passed on a developer's laptop and failed on
//      Render precisely because nothing ever pinned the clock.
//
//   2. DATE INPUT. dispatchDate arrives as a raw query string and
//      reaches Postgres as $1::date. It is checked before it is
//      compared, because the comparison is a string compare that
//      calls '0000-99-99' a past date and triggers a WRITE.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const repoMock = {
  getBoard:                vi.fn(),
  getGateView:             vi.fn(),
  collect:                 vi.fn(),
  sweepNonCollections:     vi.fn(),
  getDispatchNote:         vi.fn(),
  getNonCollectionHistory: vi.fn(),
};

vi.mock('../src/repositories/dispatch.repository.js', () => ({ default: repoMock }));

const module = await import('../src/services/dispatch.service.js');
const dispatchService = module.default;
const {
  todayString,
  currentHour,
  pgDateToString,
  isValidDateString,
  evaluateEligibility,
  NON_COLLECTION_CUTOFF_HOUR,
} = module;

const MANAGER = { id: 1, role: 'manager' };
const WORKER  = { id: 2, role: 'warehouse_worker' };

// Freeze the clock at a UTC instant and say what the warehouse clock
// reads at that moment. Cape Town is UTC+2 with no daylight saving.
const atUtc = (iso) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  repoMock.getBoard.mockResolvedValue([]);
  repoMock.sweepNonCollections.mockResolvedValue({ flagged: 0, slipIds: [] });
  repoMock.getNonCollectionHistory.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

// ── The warehouse clock ───────────────────────────────────────
describe('todayString — the date in Cape Town, not the date in UTC', () => {
  it('is already tomorrow at 22:30 UTC', async () => {
    atUtc('2026-08-19T22:30:00Z');   // 00:30 on the 20th in Cape Town
    expect(todayString()).toBe('2026-08-20');
  });

  it('is still yesterday at 21:00 UTC', async () => {
    atUtc('2026-08-19T21:00:00Z');   // 23:00 on the 19th in Cape Town
    expect(todayString()).toBe('2026-08-19');
  });

  it('rolls over at 22:00 UTC exactly, which is midnight SAST', async () => {
    atUtc('2026-08-19T21:59:59Z');
    expect(todayString()).toBe('2026-08-19');
    atUtc('2026-08-19T22:00:00Z');
    expect(todayString()).toBe('2026-08-20');
  });

  it('crosses a month boundary correctly', async () => {
    atUtc('2026-08-31T22:00:00Z');
    expect(todayString()).toBe('2026-09-01');
  });

  it('pads single-digit months and days', async () => {
    atUtc('2026-01-05T08:00:00Z');
    expect(todayString()).toBe('2026-01-05');
  });
});

describe('currentHour — the hour on the warehouse clock', () => {
  it('reads 16:00 SAST when UTC says 14:00', () => {
    atUtc('2026-08-19T14:00:00Z');
    expect(currentHour()).toBe(16);
  });

  // The whole bug: getHours() on a UTC container returned 14 here, so
  // the cutoff did not fire until 18:00 SAST — two hours after the
  // gate closed, every single day.
  it('is at the cutoff at 14:00 UTC, not at 16:00 UTC', () => {
    atUtc('2026-08-19T14:00:00Z');
    expect(currentHour() >= NON_COLLECTION_CUTOFF_HOUR).toBe(true);

    atUtc('2026-08-19T13:59:00Z');
    expect(currentHour() >= NON_COLLECTION_CUTOFF_HOUR).toBe(false);
  });

  it('wraps past midnight without going negative', () => {
    atUtc('2026-08-19T23:30:00Z');   // 01:30 SAST
    expect(currentHour()).toBe(1);
  });
});

// ── DATE columns are a different problem ──────────────────────
describe('pgDateToString — formatting a value out of a DATE column', () => {
  // node-postgres parses a DATE at LOCAL midnight, so reading the
  // local components back returns the original string. toISOString()
  // would shift it a day backwards anywhere east of UTC.
  it('returns the date it was given', () => {
    expect(pgDateToString(new Date(2026, 7, 19))).toBe('2026-08-19');
  });

  it('pads single digits', () => {
    expect(pgDateToString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns null for something that is not a date', () => {
    expect(pgDateToString('not a date')).toBeNull();
  });
});

// ── Client-supplied dates ─────────────────────────────────────
describe('isValidDateString', () => {
  it.each(['2026-08-19', '2026-01-01', '2024-02-29'])('accepts %s', (value) => {
    expect(isValidDateString(value)).toBe(true);
  });

  it.each([
    ['0000-99-99', 'a shape-valid string with impossible parts'],
    ['2026-02-30', 'a day that does not exist in that month'],
    ['2025-02-29', 'a leap day in a non-leap year'],
    ['2026-13-01', 'a thirteenth month'],
    ['19-08-2026', 'the wrong field order'],
    ['Mon Aug 17 2026', 'something new Date() would happily accept'],
    ['2026-8-19', 'unpadded parts'],
    ['', 'an empty string'],
  ])('rejects %s — %s', (value) => {
    expect(isValidDateString(value)).toBe(false);
  });
});

// ── The board ─────────────────────────────────────────────────
describe('getBoard — the sweep trigger', () => {
  it('sweeps a past date whatever the time', async () => {
    atUtc('2026-08-19T06:00:00Z');   // 08:00 SAST
    await dispatchService.getBoard({ dispatchDate: '2026-08-18' }, MANAGER);
    expect(repoMock.sweepNonCollections).toHaveBeenCalledWith(
      { dispatchDate: '2026-08-18', actorId: MANAGER.id }
    );
  });

  it('does not sweep today before the cutoff', async () => {
    atUtc('2026-08-19T13:00:00Z');   // 15:00 SAST
    await dispatchService.getBoard({ dispatchDate: '2026-08-19' }, MANAGER);
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });

  // The two hours the old code got wrong.
  it('sweeps today from 16:00 SAST, which is 14:00 UTC', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await dispatchService.getBoard({ dispatchDate: '2026-08-19' }, MANAGER);
    expect(repoMock.sweepNonCollections).toHaveBeenCalled();
  });

  it('does not sweep a future date', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await dispatchService.getBoard({ dispatchDate: '2026-08-20' }, MANAGER);
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });

  it('does not sweep when no date is asked for', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await dispatchService.getBoard({}, MANAGER);
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });

  // A malformed date used to string-compare as "past", so it reached
  // the sweep — a WRITE — before Postgres rejected the cast.
  it('refuses a malformed date without writing anything', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await expect(dispatchService.getBoard({ dispatchDate: '0000-99-99' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
    expect(repoMock.getBoard).not.toHaveBeenCalled();
  });

  it('still rejects a bad cohort and status', async () => {
    atUtc('2026-08-19T08:00:00Z');
    await expect(dispatchService.getBoard({ cohort: 'week3' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    await expect(dispatchService.getBoard({ status: 'nonsense' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ── Eligibility ───────────────────────────────────────────────
const gateView = (over = {}) => ({
  ecd_name:         'Little Stars',
  ecd_is_active:    true,
  ecd_approved_at:  '2026-01-01',
  slip_status:      'complete',
  dispatch_date:    new Date(2026, 7, 19),
  dispatch_status:  null,
  items:            [],
  ...over,
});

describe('evaluateEligibility — wrongDay against the warehouse date', () => {
  it('is not the wrong day for a pallet booked today', () => {
    atUtc('2026-08-19T06:00:00Z');
    expect(evaluateEligibility(gateView()).wrongDay).toBe(false);
  });

  // 00:30 SAST on the 20th. The old code read the UTC date, still the
  // 19th, and called a pallet booked for the 19th "today" — so an
  // early-morning collection quietly skipped the manager override it
  // should have needed.
  it('is the wrong day once Cape Town has rolled over, even though UTC has not', () => {
    atUtc('2026-08-19T22:30:00Z');
    expect(evaluateEligibility(gateView()).wrongDay).toBe(true);
  });

  it('flags afterCutoff on the warehouse clock', () => {
    atUtc('2026-08-19T14:00:00Z');
    expect(evaluateEligibility(gateView()).afterCutoff).toBe(true);
    atUtc('2026-08-19T13:00:00Z');
    expect(evaluateEligibility(gateView()).afterCutoff).toBe(false);
  });

  it('treats an unapproved centre as inactive (BR-11)', () => {
    atUtc('2026-08-19T06:00:00Z');
    expect(evaluateEligibility(gateView({ ecd_approved_at: null })).ecdInactive).toBe(true);
  });
});

// ── Sweep on demand ───────────────────────────────────────────
describe('sweep', () => {
  it('defaults to the warehouse date, not the UTC one', async () => {
    atUtc('2026-08-19T22:30:00Z');
    await dispatchService.sweep({}, MANAGER);
    expect(repoMock.sweepNonCollections).toHaveBeenCalledWith(
      { dispatchDate: '2026-08-20', actorId: MANAGER.id }
    );
  });

  it('refuses a non-manager', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await expect(dispatchService.sweep({}, WORKER)).rejects.toMatchObject({ status: 403 });
  });

  // new Date('Mon Aug 17 2026') is a valid Date, so the old check
  // passed it straight through to $1::date.
  it('refuses a date Postgres could not cast', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await expect(dispatchService.sweep({ dispatchDate: 'Mon Aug 17 2026' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });
});

// ── Non-collection history ────────────────────────────────────
describe('getNonCollectionHistory', () => {
  it('lets a manager through with no filters', async () => {
    await dispatchService.getNonCollectionHistory({}, MANAGER);
    expect(repoMock.getNonCollectionHistory).toHaveBeenCalledWith(
      { ecdId: undefined, from: undefined, to: undefined }
    );
  });

  it('refuses a worker', async () => {
    await expect(dispatchService.getNonCollectionHistory({}, WORKER))
      .rejects.toMatchObject({ status: 403 });
  });

  it('lets finance through — it feeds BR-16 reconciliation', async () => {
    await dispatchService.getNonCollectionHistory({}, { id: 3, role: 'finance' });
    expect(repoMock.getNonCollectionHistory).toHaveBeenCalled();
  });

  // Number('') is 0 and Number.isInteger(0) is true, so an empty
  // ecdId used to become "centre 0" and return nothing at all
  // instead of the unfiltered history that was asked for.
  it('treats an empty ecdId as no filter rather than centre zero', async () => {
    await dispatchService.getNonCollectionHistory({ ecdId: '' }, MANAGER);
    expect(repoMock.getNonCollectionHistory)
      .toHaveBeenCalledWith(expect.objectContaining({ ecdId: undefined }));
  });

  it.each(['0', '-4', 'abc', '2.5'])('rejects ecdId %s', async (ecdId) => {
    await expect(dispatchService.getNonCollectionHistory({ ecdId }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
  });

  it.each(['from', 'to'])('rejects a malformed %s date', async (key) => {
    await expect(dispatchService.getNonCollectionHistory({ [key]: '2026-02-30' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.getNonCollectionHistory).not.toHaveBeenCalled();
  });

  it('passes a valid range through', async () => {
    await dispatchService.getNonCollectionHistory(
      { ecdId: '7', from: '2026-08-01', to: '2026-08-31' }, MANAGER
    );
    expect(repoMock.getNonCollectionHistory).toHaveBeenCalledWith(
      { ecdId: 7, from: '2026-08-01', to: '2026-08-31' }
    );
  });
});
// ── The 16:00 write-off is a flag, not a lock (BR-14) ─────────
// The sweep runs opportunistically from getBoard, so from 16:00
// onwards essentially every uncollected pallet carries
// dispatch_status = 'not_collected'. When that fed needsOverride, the
// effect was that the gate closed itself at 16:00 for the warehouse
// worker actually standing at it — a driver arriving at 16:40 had to
// find a manager before food could leave, which is the opposite of
// the rule this service is built on.
//
// These pin the corrected behaviour: written off still SHOWS (the
// flag survives, and the repository files the event as
// 'late_collected'), but it does not gate anything.
describe('a pallet written off at 16:00 can still be collected', () => {
  const writtenOff = () => gateView({ dispatch_status: 'not_collected' });

  beforeEach(() => {
    atUtc('2026-08-19T14:40:00Z');          // 16:40 SAST, after the sweep
    repoMock.collect.mockResolvedValue({ event: { id: 9, status: 'late_collected' } });
  });

  const body = {
    driverName: 'S. Mokoena',
    signature:  'data:image/png;base64,iVBORw0KGgo=',
  };

  it('still flags it as written off', () => {
    expect(evaluateEligibility(writtenOff()).writtenOff).toBe(true);
  });

  it('lets a warehouse worker collect it with no override reason', async () => {
    repoMock.getGateView.mockResolvedValue(writtenOff());

    await expect(dispatchService.collect(1, body, WORKER)).resolves.toMatchObject({
      event: { status: 'late_collected' },
    });

    expect(repoMock.collect).toHaveBeenCalledWith(
      expect.objectContaining({ overrideReason: null, actorId: WORKER.id })
    );
  });

  it('does not ask a manager for a reason either', async () => {
    repoMock.getGateView.mockResolvedValue(writtenOff());
    await expect(dispatchService.collect(1, body, MANAGER)).resolves.toBeTruthy();
  });

  // The cutoff alone — before the sweep has written anything — was
  // never a gate, and must not become one.
  it('does not gate on the clock alone', async () => {
    repoMock.getGateView.mockResolvedValue(gateView());
    expect(evaluateEligibility(gateView()).afterCutoff).toBe(true);
    await expect(dispatchService.collect(1, body, WORKER)).resolves.toBeTruthy();
  });

  // Being written off must not smuggle a pallet past the checks that
  // ARE gates. A written-off pallet at an inactive centre is still
  // blocked, and one that packing never closed off still needs a
  // manager.
  it('still blocks an inactive centre (BR-11)', async () => {
    repoMock.getGateView.mockResolvedValue(
      gateView({ dispatch_status: 'not_collected', ecd_is_active: false })
    );
    await expect(dispatchService.collect(1, body, WORKER)).rejects.toMatchObject({ status: 409 });
    expect(repoMock.collect).not.toHaveBeenCalled();
  });

  it('still needs a manager when packing has not closed the slip', async () => {
    repoMock.getGateView.mockResolvedValue(
      gateView({ dispatch_status: 'not_collected', slip_status: 'in_progress' })
    );
    await expect(dispatchService.collect(1, body, WORKER)).rejects.toMatchObject({ status: 403 });
  });
});