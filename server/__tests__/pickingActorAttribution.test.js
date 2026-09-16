// ─────────────────────────────────────────────────────────────
// server/__tests__/pickingActorAttribution.test.js
//
// The single most dangerous thing in the guest flow: which id lands in
// an actor column.
//
// picking_events.actor_id, picking_slip_items.confirmed_by and
// picking_slips.completed_by are all int4 with a FOREIGN KEY to
// users(id). volunteers.id is int8. The FK does NOT reject a volunteer
// id — it accepts it whenever that number exists in users, and the
// ranges overlap: users run 1-346, volunteers run 1-7, and 6 of the 7
// current volunteers collide with a real staff account. Volunteer 1 is
// users row 1, which is admin001.
//
// So a guest's work would be recorded, permanently and plausibly, as
// the administrator's. These tests assert NULL goes in those columns
// and the attribution goes in the jsonb detail instead.
//
// They also assert the staff path is byte-for-byte unchanged, because
// the way to "fix" a failing guest test is to loosen the staff one.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
const poolMock = { connect: vi.fn(() => client), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: pickingRepository } = await import('../src/repositories/picking.repository.js');

const STAFF     = { type: 'user', id: 3 };
// int8 arrives from node-postgres as a string — the real shape of a
// guest id, and the one that breaks `!==` comparisons.
const VOLUNTEER = { type: 'volunteer', id: '7' };

// Finds the INSERT INTO picking_events calls and returns [eventType, actorId, detail].
const eventCalls = () => client.query.mock.calls
  .filter(([sql]) => /INSERT INTO picking_events/i.test(String(sql)))
  .map(([, params]) => ({ eventType: params[1], actorId: params[2], detail: params[3] }));

const itemUpdateParams = () => client.query.mock.calls
  .find(([sql]) => /UPDATE picking_slip_items/i.test(String(sql)))?.[1];

const slipUpdateParams = () => client.query.mock.calls
  .find(([sql]) => /UPDATE picking_slips/i.test(String(sql)))?.[1];

// A slip held by staff id 3 AND volunteer '7' at once — not a real
// state, but it lets one fixture serve both ownership branches and
// proves each reads its own column rather than whichever is set.
const heldByBoth = {
  id: 132, status: 'in_progress', assigned_to: 3, assigned_volunteer_id: '7',
};

const setupItemFlow = (slip = heldByBoth) => {
  client.query.mockReset();
  client.query.mockImplementation(async (sql) => {
    const text = String(sql);
    if (/SELECT id, status, assigned_to/i.test(text))  return { rows: [slip] };
    if (/UPDATE picking_slip_items/i.test(text)) {
      return { rows: [{ id: 1, required_quantity: '5', packed_quantity: '5', quantity_variance: '0', status: 'confirmed' }] };
    }
    return { rows: [], rowCount: 0 };
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.connect.mockResolvedValue(client);
});

describe('setItemStatus — guest attribution', () => {
  it('writes NULL to confirmed_by for a volunteer', async () => {
    setupItemFlow();
    await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actor: VOLUNTEER,
    });

    // UPDATE ... confirmed_by = $4
    expect(itemUpdateParams()[3]).toBeNull();
  });

  it('writes NULL to picking_events.actor_id and puts the volunteer in detail', async () => {
    setupItemFlow();
    await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actor: VOLUNTEER,
    });

    const events = eventCalls();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.actorId).toBeNull();
      expect(e.detail).toMatchObject({ actor_type: 'volunteer', volunteer_id: '7' });
    }
  });

  it('reuses the staff event vocabulary, inventing no guest_* types', async () => {
    setupItemFlow();
    await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'flagged', flagReason: 'Damaged', actor: VOLUNTEER,
    });

    for (const e of eventCalls()) {
      expect(e.eventType).not.toMatch(/guest/);
      expect(['item_confirmed', 'item_flagged', 'item_variance']).toContain(e.eventType);
    }
  });

  it('measures a volunteer against assigned_volunteer_id, not assigned_to', async () => {
    // Held by volunteer '7' only. Staff id 3 must not get in.
    setupItemFlow({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: '7' });

    const mine = await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actor: VOLUNTEER,
    });
    expect(mine.forbidden).toBeUndefined();

    setupItemFlow({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: '7' });
    const notMine = await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5,
      actor: { type: 'volunteer', id: '9' },
    });
    expect(notMine.forbidden).toBe(true);
  });

  // The string/number trap: '7' from the JWT vs 7 from the column.
  it('compares volunteer ids as text across string and number forms', async () => {
    setupItemFlow({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: 7 });
    const result = await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actor: { type: 'volunteer', id: '7' },
    });
    expect(result.forbidden).toBeUndefined();
  });

  it('does not let a volunteer id match a staff id in the other column', async () => {
    // Slip held by STAFF user 7. A volunteer whose id is also 7 must be refused.
    setupItemFlow({ id: 132, status: 'in_progress', assigned_to: 7, assigned_volunteer_id: null });
    const result = await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actor: { type: 'volunteer', id: '7' },
    });
    expect(result.forbidden).toBe(true);
  });
});

describe('setItemStatus — staff path unchanged', () => {
  it('still writes the user id to confirmed_by and actor_id', async () => {
    setupItemFlow();
    await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actor: STAFF,
    });

    expect(itemUpdateParams()[3]).toBe(3);
    for (const e of eventCalls()) {
      expect(e.actorId).toBe(3);
      expect(e.detail).not.toHaveProperty('actor_type');
    }
  });

  // Every existing caller passes actorId, not actor.
  it('still accepts the legacy actorId argument as staff', async () => {
    setupItemFlow();
    await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actorId: 3,
    });

    expect(itemUpdateParams()[3]).toBe(3);
    expect(eventCalls()[0].actorId).toBe(3);
  });

  it('still measures staff against assigned_to', async () => {
    setupItemFlow({ id: 132, status: 'in_progress', assigned_to: 3, assigned_volunteer_id: null });
    const ok = await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actorId: 3,
    });
    expect(ok.forbidden).toBeUndefined();

    setupItemFlow({ id: 132, status: 'in_progress', assigned_to: 3, assigned_volunteer_id: null });
    const refused = await pickingRepository.setItemStatus({
      slipId: 132, itemId: 1, status: 'confirmed', packedQuantity: 5, actorId: 4,
    });
    expect(refused.forbidden).toBe(true);
  });
});

describe('completeSlip — attribution', () => {
  const setupComplete = (slip = heldByBoth) => {
    client.query.mockReset();
    client.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (/SELECT id, status, assigned_to/i.test(text))   return { rows: [slip] };
      if (/COUNT\(\*\)::int AS n/i.test(text))            return { rows: [{ n: 0 }] };
      if (/WITH packed AS/i.test(text))                   return { rows: [] };
      if (/UPDATE picking_slips/i.test(text))             return { rows: [{ id: 132, status: 'complete' }] };
      return { rows: [], rowCount: 0 };
    });
  };

  it('writes NULL to completed_by for a volunteer', async () => {
    setupComplete();
    await pickingRepository.completeSlip({ slipId: 132, palletRef: 'P1', actor: VOLUNTEER });

    // UPDATE picking_slips SET ... completed_by = $1
    expect(slipUpdateParams()[0]).toBeNull();
  });

  it('writes NULL actor_id with volunteer detail on the completed event', async () => {
    setupComplete();
    await pickingRepository.completeSlip({ slipId: 132, palletRef: 'P1', actor: VOLUNTEER });

    const completed = eventCalls().find((e) => e.eventType === 'completed');
    expect(completed.actorId).toBeNull();
    expect(completed.detail).toMatchObject({ actor_type: 'volunteer', volunteer_id: '7' });
  });

  it('still writes the user id for staff', async () => {
    setupComplete();
    await pickingRepository.completeSlip({ slipId: 132, palletRef: 'P1', actorId: 3 });

    expect(slipUpdateParams()[0]).toBe(3);
    expect(eventCalls().find((e) => e.eventType === 'completed').actorId).toBe(3);
  });

  it('measures a volunteer against assigned_volunteer_id', async () => {
    setupComplete({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: '7' });
    const refused = await pickingRepository.completeSlip({
      slipId: 132, actor: { type: 'volunteer', id: '9' },
    });
    expect(refused.forbidden).toBe(true);
  });
});
