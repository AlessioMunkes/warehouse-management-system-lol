// ─────────────────────────────────────────────────────────────
// server/__tests__/slipAccess.repository.test.js
//
// The SQL shape of the guest access paths, and the claim guards.
//
// Mocked at the pool, like attendance.repository.test.js — enough to
// prove which columns are selected, which column a claim writes, and
// what the guards do, without a live database.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
const poolMock = { connect: vi.fn(() => client), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/slipAccess.repository.js');

const TOKEN = '83861845-e253-4b49-802e-5ec551200c60';

const lastSql = () => String(poolMock.query.mock.calls.at(-1)[0]);

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.connect.mockResolvedValue(client);
  poolMock.query.mockResolvedValue({ rows: [] });
});

describe('preview SQL', () => {
  it('selects only the poster fields, never the token or the items', async () => {
    await repo.getPreviewByToken(TOKEN);
    const sql = lastSql();

    // What it must expose
    expect(sql).toMatch(/beneficiary_kind/);
    expect(sql).toMatch(/item_count/);

    // What it must not. public_token appears in the WHERE clause, so
    // assert it is not among the SELECTed columns rather than absent.
    const selectClause = sql.slice(0, sql.search(/\bFROM\b/i));
    expect(selectClause).not.toMatch(/public_token/);
    expect(selectClause).not.toMatch(/quantity_on_hand/);
    expect(selectClause).not.toMatch(/packer_name/);
    expect(selectClause).not.toMatch(/generated_by/);
  });

  it('returns the dispatch date as a plain calendar day, not a timestamp', async () => {
    await repo.getPreviewByToken(TOKEN);
    // ::text, or node-postgres hands back a Date that JSON turns into
    // the previous day in UTC.
    expect(lastSql()).toMatch(/dispatch_date::text/);
  });

  it('never queries a Love Activism / VMS table', async () => {
    await repo.getPreviewByToken(TOKEN);
    await repo.findPreviewsByShortCode('200c60');
    await repo.listUnclaimedForDate('2026-09-16');

    const allSql = poolMock.query.mock.calls.map(([q]) => String(q)).join('\n');
    for (const t of ['volunteer_bookings', 'attendance', 'vms_sync',
                     'love_activism_events', 'event_spaces', 'event_timeslots']) {
      expect(allSql).not.toContain(t);
    }
  });

  it('rejects a malformed token without hitting the database', async () => {
    const result = await repo.getPreviewByToken('../../etc/passwd');
    expect(result).toBeNull();
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('rejects a malformed short code without hitting the database', async () => {
    expect(await repo.findPreviewsByShortCode('zzz')).toEqual([]);
    expect(await repo.findPreviewsByShortCode('12345')).toEqual([]);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('matches the short code case-insensitively on the last 6 characters', async () => {
    await repo.findPreviewsByShortCode('200C60');
    expect(lastSql()).toMatch(/RIGHT\(ps\.public_token::text, 6\) = LOWER/);
  });

  it('returns every short-code match so the caller can refuse ambiguity', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });
    expect(await repo.findPreviewsByShortCode('200c60')).toHaveLength(2);
  });

  it('lists only unclaimed, claimable slips for the date', async () => {
    await repo.listUnclaimedForDate('2026-09-16');
    const sql = lastSql();
    expect(sql).toMatch(/assigned_volunteer_id IS NULL/);
    expect(sql).toMatch(/assigned_to IS NULL/);
  });
});

describe('claimForVolunteer', () => {
  const setup = (slip) => {
    client.query.mockReset();
    client.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (/SELECT id, status, assigned_to/i.test(text)) return { rows: slip ? [slip] : [] };
      if (/UPDATE picking_slips/i.test(text)) {
        return { rows: [{ ...slip, status: 'in_progress', assigned_volunteer_id: '7' }] };
      }
      return { rows: [], rowCount: 0 };
    });
  };

  const updateCall = () => client.query.mock.calls
    .find(([sql]) => /UPDATE picking_slips/i.test(String(sql)));
  const eventCall = () => client.query.mock.calls
    .find(([sql]) => /INSERT INTO picking_events/i.test(String(sql)));

  it('writes assigned_volunteer_id and never assigned_to', async () => {
    setup({ id: 132, status: 'pending', assigned_to: null, assigned_volunteer_id: null });
    await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    const [sql, params] = updateCall();
    expect(String(sql)).toMatch(/assigned_volunteer_id = \$1/);
    expect(String(sql)).not.toMatch(/assigned_to\s*=/);
    expect(params[0]).toBe('7');
  });

  it('logs an assigned event with NULL actor_id and the volunteer in detail', async () => {
    setup({ id: 132, status: 'pending', assigned_to: null, assigned_volunteer_id: null });
    await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    const [sql, params] = eventCall();
    expect(String(sql)).toMatch(/'assigned'/);
    expect(String(sql)).toMatch(/NULL/);
    expect(params[1]).toEqual({ actor_type: 'volunteer', volunteer_id: '7' });
  });

  it('refuses a completed pallet', async () => {
    setup({ id: 132, status: 'complete', assigned_to: null, assigned_volunteer_id: null });
    const result = await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    expect(result.locked).toBe(true);
    expect(updateCall()).toBeUndefined();
  });

  it('refuses a pallet held by staff', async () => {
    setup({ id: 132, status: 'in_progress', assigned_to: 3, assigned_volunteer_id: null });
    const result = await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    expect(result.takenByStaff).toBe(true);
    expect(updateCall()).toBeUndefined();
  });

  it('refuses a pallet held by a different volunteer', async () => {
    setup({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: '9' });
    const result = await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    expect(result.takenByVolunteer).toBe(true);
    expect(updateCall()).toBeUndefined();
  });

  // Re-scanning your own poster is not a collision.
  it('is idempotent for the volunteer who already holds it', async () => {
    setup({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: '7' });
    const result = await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    expect(result.takenByVolunteer).toBeUndefined();
    expect(result.alreadyMine).toBe(true);
    expect(updateCall()).toBeDefined();
  });

  it('compares holder ids as text across string and number forms', async () => {
    setup({ id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: 7 });
    const result = await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });
    expect(result.takenByVolunteer).toBeUndefined();
  });

  it('takes a row lock before deciding', async () => {
    setup({ id: 132, status: 'pending', assigned_to: null, assigned_volunteer_id: null });
    await repo.claimForVolunteer({ slipId: 132, volunteerId: '7' });

    const select = client.query.mock.calls.find(([sql]) => /SELECT id, status/i.test(String(sql)));
    expect(String(select[0])).toMatch(/FOR UPDATE/);
  });

  it('rolls back and releases the client when the slip is gone', async () => {
    setup(null);
    const result = await repo.claimForVolunteer({ slipId: 999, volunteerId: '7' });

    expect(result.notFound).toBe(true);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('volunteerHoldsSlip', () => {
  it('is false when nobody holds the slip', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ assigned_volunteer_id: null }] });
    expect(await repo.volunteerHoldsSlip({ slipId: 132, volunteerId: '7' })).toBe(false);
  });

  it('is false for a different volunteer', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ assigned_volunteer_id: '9' }] });
    expect(await repo.volunteerHoldsSlip({ slipId: 132, volunteerId: '7' })).toBe(false);
  });

  it('is true for the holder, across string and number forms', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ assigned_volunteer_id: 7 }] });
    expect(await repo.volunteerHoldsSlip({ slipId: 132, volunteerId: '7' })).toBe(true);
  });

  it('is false for a slip that does not exist', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    expect(await repo.volunteerHoldsSlip({ slipId: 999, volunteerId: '7' })).toBe(false);
  });
});
