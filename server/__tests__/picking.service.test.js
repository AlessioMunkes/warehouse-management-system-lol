// ─────────────────────────────────────────────────────────────
// server/__tests__/picking.service.test.js
//
// Business-logic tests for picking.service.js. The repository is
// mocked — which is mandatory, not just tidy: picking.repository.js
// imports ./stock.repository.js, which does not exist in the repo,
// so any test that lets the real module load dies with
// ERR_MODULE_NOT_FOUND before a single assertion runs.
//
// Time is frozen so the "no slips for a past date" rule and the
// fortnightly rotation are deterministic in CI regardless of when
// the suite runs or which timezone the runner is in.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ROLES } from '../src/middleware/auth.middleware.js';

const repoMock = {
  getCohortAnchor: vi.fn(),
  getSlips:        vi.fn(),
  getSlipById:     vi.fn(),
  generateSlips:   vi.fn(),
  createSlip:      vi.fn(),
  assignSlip:      vi.fn(),
  setItemStatus:   vi.fn(),
  completeSlip:    vi.fn(),
};

vi.mock('../src/repositories/picking.repository.js', () => ({ default: repoMock }));

const { default: pickingService } = await import('../src/services/picking.service.js');

// ── Fixtures ──────────────────────────────────────────────────
const WORKER  = { id: 10, role: ROLES.WORKER };
const WORKER2 = { id: 11, role: ROLES.WORKER };
const MANAGER = { id: 20, role: ROLES.MANAGER };
const ADMIN   = { id: 21, role: ROLES.ADMIN };
const FINANCE = { id: 30, role: ROLES.FINANCE };

// Anchor Monday 2026-01-05 puts the week of Mon 2026-08-03 on week1
// (30 whole weeks later) and the week of Mon 2026-08-10 on week2.
const ANCHOR      = '2026-01-05';
const WEEK1_DATE  = '2026-08-03';   // Monday, week1
const WEEK1_MIDWK = '2026-08-05';   // Wednesday of the same week
const WEEK2_DATE  = '2026-08-10';   // Monday, week2
const PAST_DATE   = '2026-07-20';

const NOW = new Date('2026-08-01T09:00:00Z');   // Saturday before WEEK1_DATE

const SLIP = { id: 1, status: 'in_progress', assigned_to: 10 };
const ITEM = { id: 5, status: 'confirmed', packed_quantity: 3 };

const expectStatus = async (promise, status) => {
  await expect(promise).rejects.toMatchObject({ status });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  repoMock.getCohortAnchor.mockResolvedValue(ANCHOR);
  repoMock.getSlips.mockResolvedValue([]);
  repoMock.getSlipById.mockResolvedValue(SLIP);
  repoMock.generateSlips.mockResolvedValue({ created: 12 });
  repoMock.createSlip.mockResolvedValue({ slipId: 99, itemCount: 7 });
  repoMock.assignSlip.mockResolvedValue({ slip: SLIP });
  repoMock.setItemStatus.mockResolvedValue({ item: ITEM, assignedTo: 10 });
  repoMock.completeSlip.mockResolvedValue({ slip: SLIP });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── getSlips ──────────────────────────────────────────────────
describe('getSlips — filters and visibility', () => {
  it('passes through valid filters untouched', async () => {
    await pickingService.getSlips(
      { dispatchDate: WEEK1_DATE, cohort: 'week1', status: 'pending' }, MANAGER
    );
    expect(repoMock.getSlips).toHaveBeenCalledWith({
      dispatchDate: WEEK1_DATE, cohort: 'week1', status: 'pending', assignedTo: undefined,
    });
  });

  it.each(['week1', 'week2'])('accepts the cohort "%s"', async (cohort) => {
    await expect(pickingService.getSlips({ cohort }, MANAGER)).resolves.toBeDefined();
  });

  it('rejects an unknown cohort with 400', async () => {
    await expectStatus(pickingService.getSlips({ cohort: 'week3' }, MANAGER), 400);
    expect(repoMock.getSlips).not.toHaveBeenCalled();
  });

  it.each(['pending', 'in_progress', 'complete', 'cancelled'])(
    'accepts the status "%s"', async (status) => {
      await expect(pickingService.getSlips({ status }, MANAGER)).resolves.toBeDefined();
    });

  it('rejects an unknown status with 400', async () => {
    await expectStatus(pickingService.getSlips({ status: 'packed' }, MANAGER), 400);
    expect(repoMock.getSlips).not.toHaveBeenCalled();
  });

  it('scopes a packer to their own slips when they ask for "mine"', async () => {
    await pickingService.getSlips({ mine: 'true' }, WORKER);
    expect(repoMock.getSlips).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: 10 }));
  });

  it('ignores "mine" for a manager, who always sees the whole board', async () => {
    await pickingService.getSlips({ mine: 'true' }, MANAGER);
    expect(repoMock.getSlips).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: undefined }));
  });

  it('treats mine as a string, not a boolean — only "true" filters', async () => {
    // Query params arrive as strings; a real boolean true would not filter.
    await pickingService.getSlips({ mine: true }, WORKER);
    expect(repoMock.getSlips).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: undefined }));
  });

  it('shows a packer the unclaimed pool when they do not ask for "mine"', async () => {
    // Packers need to see unassigned slips in order to claim one.
    await pickingService.getSlips({}, WORKER);
    expect(repoMock.getSlips).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: undefined }));
  });
});

// ── getSlipById ───────────────────────────────────────────────
describe('getSlipById', () => {
  it('returns the slip when it exists', async () => {
    await expect(pickingService.getSlipById(1)).resolves.toBe(SLIP);
  });

  it('raises 404 when the slip is missing', async () => {
    repoMock.getSlipById.mockResolvedValueOnce(null);
    await expectStatus(pickingService.getSlipById(999), 404);
  });
});

// ── generateSlips ─────────────────────────────────────────────
describe('generateSlips — manager only, strict rotation', () => {
  it.each([[ROLES.MANAGER, MANAGER], [ROLES.ADMIN, ADMIN]])(
    '%s can generate the week\'s slips', async (_role, user) => {
      await expect(
        pickingService.generateSlips({ dispatchDate: WEEK1_DATE, cohort: 'week1' }, user)
      ).resolves.toEqual({ created: 12 });
    });

  it.each([[ROLES.WORKER, WORKER], [ROLES.FINANCE, FINANCE]])(
    '%s is refused with 403', async (_role, user) => {
      await expectStatus(
        pickingService.generateSlips({ dispatchDate: WEEK1_DATE, cohort: 'week1' }, user), 403
      );
      expect(repoMock.generateSlips).not.toHaveBeenCalled();
    });

  it('takes generatedBy from the JWT, never from the body', async () => {
    await pickingService.generateSlips(
      { dispatchDate: WEEK1_DATE, cohort: 'week1', generatedBy: 999 }, MANAGER
    );
    expect(repoMock.generateSlips).toHaveBeenCalledWith(
      expect.objectContaining({ generatedBy: MANAGER.id })
    );
  });

  it('requires a dispatch date', async () => {
    await expectStatus(pickingService.generateSlips({ cohort: 'week1' }, MANAGER), 400);
  });

  it('requires a valid cohort', async () => {
    await expectStatus(
      pickingService.generateSlips({ dispatchDate: WEEK1_DATE, cohort: 'week9' }, MANAGER), 400
    );
  });

  it('rejects an unparseable date', async () => {
    await expectStatus(
      pickingService.generateSlips({ dispatchDate: 'next tuesday', cohort: 'week1' }, MANAGER), 400
    );
  });

  it('refuses to generate slips for a past date', async () => {
    await expectStatus(
      pickingService.generateSlips({ dispatchDate: PAST_DATE, cohort: 'week2' }, MANAGER), 400
    );
    expect(repoMock.generateSlips).not.toHaveBeenCalled();
  });

  it('refuses a cohort that is not the scheduled rotation', async () => {
    // 2026-08-03 is a week1 week; asking for week2 is a mistake.
    await expectStatus(
      pickingService.generateSlips({ dispatchDate: WEEK1_DATE, cohort: 'week2' }, MANAGER), 400
    );
  });

  it('names both cohorts in the rotation error so the mistake is obvious', async () => {
    await expect(
      pickingService.generateSlips({ dispatchDate: WEEK1_DATE, cohort: 'week2' }, MANAGER)
    ).rejects.toThrow(/Week 2 is not the scheduled rotation.*Week 1 is/s);
  });

  it('has no override path — force is ignored on the bulk run', async () => {
    await expectStatus(
      pickingService.generateSlips({ dispatchDate: WEEK1_DATE, cohort: 'week2', force: true }, MANAGER),
      400
    );
  });
});

// ── Fortnightly rotation ──────────────────────────────────────
describe('fortnightly cohort rotation', () => {
  const generate = (dispatchDate, cohort) =>
    pickingService.generateSlips({ dispatchDate, cohort }, MANAGER);

  it('puts the anchor week and every even week on week1', async () => {
    await expect(generate(WEEK1_DATE, 'week1')).resolves.toBeDefined();
  });

  it('puts the following week on week2', async () => {
    await expect(generate(WEEK2_DATE, 'week2')).resolves.toBeDefined();
  });

  it('alternates again the week after that', async () => {
    await expect(generate('2026-08-17', 'week1')).resolves.toBeDefined();
  });

  it('resolves any weekday to its own Monday', async () => {
    // Wednesday 2026-08-05 belongs to the Monday 2026-08-03 week.
    await expect(generate(WEEK1_MIDWK, 'week1')).resolves.toBeDefined();
    await expectStatus(generate(WEEK1_MIDWK, 'week2'), 400);
  });

  it('treats Sunday as the end of the week, not the start', async () => {
    // ISO weeks: Sunday 2026-08-09 still belongs to the 2026-08-03 week.
    await expect(generate('2026-08-09', 'week1')).resolves.toBeDefined();
  });

  it('skips the rotation check entirely when no anchor is configured', async () => {
    repoMock.getCohortAnchor.mockResolvedValueOnce(null);
    await expect(generate(WEEK1_DATE, 'week2')).resolves.toBeDefined();
  });
});

// ── createSlip ────────────────────────────────────────────────
describe('createSlip — ad-hoc, manager only', () => {
  const body = { ecdId: 3, dispatchDate: WEEK1_DATE, cohort: 'week1' };

  it('creates a slip for a manager', async () => {
    await expect(pickingService.createSlip(body, MANAGER))
      .resolves.toEqual({ slipId: 99, itemCount: 7 });
  });

  it.each([[ROLES.WORKER, WORKER], [ROLES.FINANCE, FINANCE]])(
    '%s is refused with 403', async (_role, user) => {
      await expectStatus(pickingService.createSlip(body, user), 403);
      expect(repoMock.createSlip).not.toHaveBeenCalled();
    });

  it('requires an ECD', async () => {
    await expectStatus(
      pickingService.createSlip({ dispatchDate: WEEK1_DATE, cohort: 'week1' }, MANAGER), 400
    );
    expect(repoMock.createSlip).not.toHaveBeenCalled();
  });

  it('checks the ECD before the date, so a missing ECD is not masked', async () => {
    await expectStatus(pickingService.createSlip({ dispatchDate: PAST_DATE }, MANAGER), 400);
  });

  it('enforces the rotation by default', async () => {
    await expectStatus(pickingService.createSlip({ ...body, cohort: 'week2' }, MANAGER), 400);
  });

  it('allows an off-rotation make-up delivery when force is set', async () => {
    await expect(pickingService.createSlip({ ...body, cohort: 'week2', force: true }, MANAGER))
      .resolves.toBeDefined();
  });

  it('only accepts a real boolean for force, not the string "true"', async () => {
    await expectStatus(
      pickingService.createSlip({ ...body, cohort: 'week2', force: 'true' }, MANAGER), 400
    );
  });

  it('still refuses a past date even with force', async () => {
    // Override is for the rotation, not for time travel.
    await expectStatus(
      pickingService.createSlip({ ...body, dispatchDate: PAST_DATE, force: true }, MANAGER), 400
    );
  });

  it('maps an unknown or unapproved ECD to 404', async () => {
    repoMock.createSlip.mockResolvedValueOnce({ ecdNotFound: true });
    await expectStatus(pickingService.createSlip(body, MANAGER), 404);
  });

  it('maps a duplicate slip to 409', async () => {
    repoMock.createSlip.mockResolvedValueOnce({ alreadyExists: true });
    await expectStatus(pickingService.createSlip(body, MANAGER), 409);
  });

  it('takes generatedBy from the JWT', async () => {
    await pickingService.createSlip(body, MANAGER);
    expect(repoMock.createSlip).toHaveBeenCalledWith(
      expect.objectContaining({ generatedBy: MANAGER.id })
    );
  });
});

// ── assignSlip ────────────────────────────────────────────────
describe('assignSlip — claiming a pallet', () => {
  it('lets a packer claim a slip for themselves', async () => {
    await pickingService.assignSlip(1, {}, WORKER);
    expect(repoMock.assignSlip).toHaveBeenCalledWith(
      { slipId: 1, packerId: WORKER.id, actorId: WORKER.id, canOverride: false }
    );
  });

  it('ignores a packerId a packer tries to set for someone else', async () => {
    await pickingService.assignSlip(1, { packerId: WORKER2.id }, WORKER);
    expect(repoMock.assignSlip).toHaveBeenCalledWith(
      expect.objectContaining({ packerId: WORKER.id })
    );
  });

  it('lets a manager assign a slip to a named packer', async () => {
    await pickingService.assignSlip(1, { packerId: WORKER2.id }, MANAGER);
    expect(repoMock.assignSlip).toHaveBeenCalledWith(
      { slipId: 1, packerId: WORKER2.id, actorId: MANAGER.id, canOverride: true }
    );
  });

  it('falls back to the manager themselves when no packer is named', async () => {
    await pickingService.assignSlip(1, {}, MANAGER);
    expect(repoMock.assignSlip).toHaveBeenCalledWith(
      expect.objectContaining({ packerId: MANAGER.id })
    );
  });

  it('records the actor separately from the assignee for the audit trail', async () => {
    await pickingService.assignSlip(1, { packerId: WORKER2.id }, MANAGER);
    const call = repoMock.assignSlip.mock.calls[0][0];
    expect(call.packerId).toBe(WORKER2.id);
    expect(call.actorId).toBe(MANAGER.id);
  });

  // ── canOverride: ownership only ─────────────────────────────
  // A manager taking a pallet off a packer who has gone home is a
  // real operation the service has always claimed to support. It did
  // not: the repository had no canOverride parameter, so the conflict
  // branch fired for managers too.
  it('lets a manager override the ownership check', async () => {
    await pickingService.assignSlip(1, { packerId: WORKER2.id }, MANAGER);
    expect(repoMock.assignSlip.mock.calls[0][0].canOverride).toBe(true);
  });

  it('does not let a packer override the ownership check', async () => {
    await pickingService.assignSlip(1, {}, WORKER);
    expect(repoMock.assignSlip.mock.calls[0][0].canOverride).toBe(false);
  });

  it('surfaces a conflict as a 409 that names the way out', async () => {
    repoMock.assignSlip.mockResolvedValue({ conflict: true, assignedTo: WORKER2.id });
    await expect(pickingService.assignSlip(1, {}, WORKER)).rejects.toMatchObject({ status: 409 });
    await expect(pickingService.assignSlip(1, {}, WORKER)).rejects.toThrow(/manager can reassign/i);
  });

  it('passes a missing slip through as a 404', async () => {
    repoMock.assignSlip.mockResolvedValue({ notFound: true });
    await expect(pickingService.assignSlip(1, {}, WORKER)).rejects.toMatchObject({ status: 404 });
  });

  // ── The status guard ────────────────────────────────────────
  // Claiming a closed pallet used to reopen it: the UPDATE set
  // status = 'in_progress' with nothing checking what it was before.
  // A reopened slip leaves the dispatch board and stops counting as
  // committed stock, so the goods on it read as available again.
  it.each([
    ['complete',   /closed off by packing/i],
    ['dispatched', /left the gate/i],
    ['cancelled',  /cancelled/i],
  ])('refuses to claim a %s pallet, in words a packer can act on', async (status, message) => {
    repoMock.assignSlip.mockResolvedValue({ locked: true, status });
    await expect(pickingService.assignSlip(1, {}, WORKER)).rejects.toMatchObject({ status: 409 });
    repoMock.assignSlip.mockResolvedValue({ locked: true, status });
    await expect(pickingService.assignSlip(1, {}, WORKER)).rejects.toThrow(message);
  });

  it('refuses a manager too — reopening a closed pallet is not a claim', async () => {
    repoMock.assignSlip.mockResolvedValue({ locked: true, status: 'complete' });
    await expect(pickingService.assignSlip(1, {}, MANAGER)).rejects.toMatchObject({ status: 409 });
  });

  it('falls back to a generic refusal for a status it has no wording for', async () => {
    repoMock.assignSlip.mockResolvedValue({ locked: true, status: 'something_new' });
    await expect(pickingService.assignSlip(1, {}, WORKER)).rejects.toThrow(/no longer be claimed/i);
  });

  // ── packerId validation ─────────────────────────────────────
  // Unvalidated it reaches a foreign key and returns a 500 carrying a
  // Postgres message.
  it.each([['abc'], [0], [-3], [1.5]])('rejects packerId %p with a 400', async (packerId) => {
    await expect(pickingService.assignSlip(1, { packerId }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.assignSlip).not.toHaveBeenCalled();
  });

  it('maps a missing slip to 404', async () => {
    repoMock.assignSlip.mockResolvedValueOnce({ notFound: true });
    await expectStatus(pickingService.assignSlip(1, {}, WORKER), 404);
  });

  it('maps a slip already held by someone else to 409', async () => {
    repoMock.assignSlip.mockResolvedValueOnce({ conflict: true });
    await expectStatus(pickingService.assignSlip(1, {}, WORKER), 409);
  });
});

// ── confirmItem ───────────────────────────────────────────────
describe('confirmItem', () => {
  const ok = { packedQuantity: 3 };

  it('confirms a line on the packer\'s own slip', async () => {
    await expect(pickingService.confirmItem(1, 5, ok, WORKER)).resolves.toMatchObject(ITEM);
  });

  it('reports no variance when the packed quantity matches the slip', async () => {
    await expect(pickingService.confirmItem(1, 5, ok, WORKER))
      .resolves.toMatchObject({ variance: null });
  });

  it('carries the variance back when the packer confirmed a different quantity', async () => {
    // A confirm that does not match required_quantity is still a valid
    // confirm, but it must not look like a clean one to dispatch.
    const variance = { required: 20, packed: 10, difference: -10 };
    repoMock.setItemStatus.mockResolvedValueOnce({ item: ITEM, variance, assignedTo: WORKER.id });
    await expect(pickingService.confirmItem(1, 5, ok, WORKER))
      .resolves.toMatchObject({ variance });
  });

  it('passes the quantity and actor through to the repository', async () => {
    await pickingService.confirmItem(1, 5, ok, WORKER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith({
      slipId: 1, itemId: 5, status: 'confirmed', packedQuantity: 3,
      actorId: WORKER.id, canOverride: false,
    });
  });

  it('coerces a numeric string off the form', async () => {
    await pickingService.confirmItem(1, 5, { packedQuantity: '3' }, WORKER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ packedQuantity: 3 })
    );
  });

  it('requires a quantity', async () => {
    await expectStatus(pickingService.confirmItem(1, 5, {}, WORKER), 400);
    expect(repoMock.setItemStatus).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric quantity', async () => {
    await expectStatus(pickingService.confirmItem(1, 5, { packedQuantity: 'three' }, WORKER), 400);
  });

  it('rejects zero — the packer should flag instead', async () => {
    await expectStatus(pickingService.confirmItem(1, 5, { packedQuantity: 0 }, WORKER), 400);
  });

  it('rejects a negative quantity', async () => {
    await expectStatus(pickingService.confirmItem(1, 5, { packedQuantity: -2 }, WORKER), 400);
  });

  it('points the packer at the flag action when they packed none', async () => {
    await expect(pickingService.confirmItem(1, 5, { packedQuantity: 0 }, WORKER))
      .rejects.toThrow(/Flag the item instead/);
  });

  it('maps a missing item to 404', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ notFound: true });
    await expectStatus(pickingService.confirmItem(1, 5, ok, WORKER), 404);
  });

  it('maps a completed slip to 409 — closed pallets are immutable', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ locked: true });
    await expectStatus(pickingService.confirmItem(1, 5, ok, WORKER), 409);
  });

  it('refuses a packer working on someone else\'s pallet with 403', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ forbidden: true, assignedTo: WORKER2.id });
    await expectStatus(pickingService.confirmItem(1, 5, ok, WORKER), 403);
  });

  it('grants a manager the override flag so the repository lets them through', async () => {
    await pickingService.confirmItem(1, 5, ok, MANAGER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ canOverride: true })
    );
  });

  it('withholds the override flag from a packer', async () => {
    await pickingService.confirmItem(1, 5, ok, WORKER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ canOverride: false })
    );
  });

  it('lets a manager confirm on any pallet', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ item: ITEM, assignedTo: WORKER2.id });
    await expect(pickingService.confirmItem(1, 5, ok, MANAGER)).resolves.toMatchObject(ITEM);
  });

  it('refuses a packer on an unassigned pallet', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ forbidden: true, assignedTo: null });
    await expectStatus(pickingService.confirmItem(1, 5, ok, WORKER), 403);
  });
});

// ── flagItem ──────────────────────────────────────────────────
describe('flagItem', () => {
  const ok = { flagReason: 'Only 2 crates on the shelf' };

  it('flags a line with a reason', async () => {
    await expect(pickingService.flagItem(1, 5, ok, WORKER)).resolves.toBe(ITEM);
  });

  it('sends the trimmed reason and a null quantity by default', async () => {
    await pickingService.flagItem(1, 5, { flagReason: '  short delivery  ' }, WORKER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith({
      slipId: 1, itemId: 5, status: 'flagged', packedQuantity: null,
      flagReason: 'short delivery', actorId: WORKER.id, canOverride: false,
    });
  });

  it('requires a reason', async () => {
    await expectStatus(pickingService.flagItem(1, 5, {}, WORKER), 400);
    expect(repoMock.setItemStatus).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only reason', async () => {
    await expectStatus(pickingService.flagItem(1, 5, { flagReason: '   ' }, WORKER), 400);
  });

  it('rejects a reason over 500 characters', async () => {
    await expectStatus(pickingService.flagItem(1, 5, { flagReason: 'x'.repeat(501) }, WORKER), 400);
  });

  it('accepts a reason of exactly 500 characters', async () => {
    await expect(pickingService.flagItem(1, 5, { flagReason: 'x'.repeat(500) }, WORKER))
      .resolves.toBeDefined();
  });

  it('accepts a partial pack alongside the flag', async () => {
    await pickingService.flagItem(1, 5, { ...ok, packedQuantity: 2 }, WORKER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ packedQuantity: 2 })
    );
  });

  it('accepts zero packed — the whole point of flagging', async () => {
    await pickingService.flagItem(1, 5, { ...ok, packedQuantity: 0 }, WORKER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ packedQuantity: 0 })
    );
  });

  it('rejects a negative packed quantity', async () => {
    await expectStatus(pickingService.flagItem(1, 5, { ...ok, packedQuantity: -1 }, WORKER), 400);
  });

  it('rejects a non-numeric packed quantity', async () => {
    await expectStatus(pickingService.flagItem(1, 5, { ...ok, packedQuantity: 'two' }, WORKER), 400);
  });

  it('maps a missing item to 404 and a locked slip to 409', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ notFound: true });
    await expectStatus(pickingService.flagItem(1, 5, ok, WORKER), 404);

    repoMock.setItemStatus.mockResolvedValueOnce({ locked: true });
    await expectStatus(pickingService.flagItem(1, 5, ok, WORKER), 409);
  });

  it('refuses a packer flagging on someone else\'s pallet', async () => {
    repoMock.setItemStatus.mockResolvedValueOnce({ forbidden: true, assignedTo: WORKER2.id });
    await expectStatus(pickingService.flagItem(1, 5, ok, WORKER), 403);
  });

  it('grants a manager the override flag when flagging', async () => {
    await pickingService.flagItem(1, 5, ok, MANAGER);
    expect(repoMock.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ canOverride: true })
    );
  });
});

// ── completeSlip ──────────────────────────────────────────────
describe('completeSlip', () => {
  it('closes the pallet and returns the slip', async () => {
    await expect(pickingService.completeSlip(1, { palletRef: 'PAL-001' }, WORKER))
      .resolves.toMatchObject({ slip: SLIP });
  });

  it('passes the pallet reference and actor through', async () => {
    await pickingService.completeSlip(1, { palletRef: 'PAL-001' }, WORKER);
    expect(repoMock.completeSlip).toHaveBeenCalledWith(
      { slipId: 1, palletRef: 'PAL-001', actorId: WORKER.id, canOverride: false }
    );
  });

  it('grants a manager the override flag when closing', async () => {
    await pickingService.completeSlip(1, {}, MANAGER);
    expect(repoMock.completeSlip).toHaveBeenCalledWith(
      expect.objectContaining({ canOverride: true })
    );
  });

  it('allows completion without a pallet reference', async () => {
    await expect(pickingService.completeSlip(1, {}, WORKER)).resolves.toMatchObject({ slip: SLIP });
  });

  it('maps a missing slip to 404', async () => {
    repoMock.completeSlip.mockResolvedValueOnce({ notFound: true });
    await expectStatus(pickingService.completeSlip(1, {}, WORKER), 404);
  });

  it('maps an already-closed slip to 409', async () => {
    repoMock.completeSlip.mockResolvedValueOnce({ alreadyComplete: true });
    await expectStatus(pickingService.completeSlip(1, {}, WORKER), 409);
  });

  it('blocks completion with 422 while any line is still pending', async () => {
    // The business-case rule: no pallet closes with unanswered lines.
    repoMock.completeSlip.mockResolvedValueOnce({ pendingItems: 3 });
    await expectStatus(pickingService.completeSlip(1, {}, WORKER), 422);
  });

  it('says how many lines are outstanding', async () => {
    repoMock.completeSlip.mockResolvedValueOnce({ pendingItems: 3 });
    await expect(pickingService.completeSlip(1, {}, WORKER)).rejects.toThrow(/3 item\(s\)/);
  });

  it('completes even when stock went negative — food is never blocked', async () => {
    repoMock.completeSlip.mockResolvedValueOnce({
      slip: SLIP,
      shortfalls: [{ productId: 4, onHand: 2, required: 5, after: -3 }],
    });
    await expect(pickingService.completeSlip(1, {}, WORKER)).resolves.toBeDefined();
  });
});

// ── Regressions — previously known defects, now fixed ─────────
describe('regressions — previously known defects', () => {

  it('completeSlip returns the shortfall warnings, not just the slip', async () => {
    // Was DEFECT B. The repository returns { slip, shortfalls } and the
    // controller's docblock promises { slip, shortfalls? }, but the
    // service used to return `result.slip` alone — so a manager was
    // never told a pallet had been closed against stock the system does
    // not have, and the client's `result.slip` came back undefined.
    const shortfalls = [{ productId: 4, onHand: 2, required: 5, after: -3 }];
    repoMock.completeSlip.mockResolvedValueOnce({ slip: SLIP, shortfalls });

    const result = await pickingService.completeSlip(1, {}, WORKER);
    expect(result).toMatchObject({ slip: SLIP, shortfalls });
  });

  it('completeSlip passes unit mismatches through as well', async () => {
    const unitMismatches = [{ productId: 4, slipUnit: 'kg' }];
    repoMock.completeSlip.mockResolvedValueOnce({ slip: SLIP, unitMismatches });

    await expect(pickingService.completeSlip(1, {}, WORKER))
      .resolves.toMatchObject({ unitMismatches });
  });

  it('completeSlip refuses a packer closing someone else\'s pallet', async () => {
    // Was DEFECT C. confirmItem and flagItem both refused a packer
    // working on another packer's pallet, but completeSlip had no such
    // check — and completing is the write that moves stock, so it
    // cannot be looser than the writes leading up to it. The check now
    // lives in the repository, inside the row lock, the same way it
    // does for confirm and flag.
    repoMock.completeSlip.mockResolvedValueOnce({ forbidden: true, assignedTo: WORKER2.id });
    await expectStatus(pickingService.completeSlip(1, {}, WORKER), 403);
  });

  it('completeSlip still lets a manager close any pallet', async () => {
    await pickingService.completeSlip(1, {}, MANAGER);
    expect(repoMock.completeSlip).toHaveBeenCalledWith(
      expect.objectContaining({ canOverride: true })
    );
  });
});