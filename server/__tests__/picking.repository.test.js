// ─────────────────────────────────────────────────────────────
// server/__tests__/picking.repository.test.js
//
// Transaction-level tests for setItemStatus. The pool is mocked with
// a fake client that records every statement, so we can prove WHERE in
// the transaction the authorisation decision happens — which is the
// whole point of the fix. A service-level test cannot show this,
// because by then the transaction has already closed.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: pickingRepository } = await import('../src/repositories/picking.repository.js');

const OWNER = 10;
const OTHER = 11;

// slip: the row returned by the FOR UPDATE lock
const makeClient = (slip) => {
  const calls = [];
  return {
    calls,
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      calls.push(sql.replace(/\s+/g, ' ').trim());
      if (/SELECT id, status, assigned_to FROM picking_slips/i.test(sql)) {
        return { rows: slip ? [slip] : [] };
      }
      if (/UPDATE picking_slip_items/i.test(sql)) {
        // quantity_variance is subtracted by Postgres, not by JS, so
        // the fake hands it back the way the database would.
        return {
          rows: [{
            id: 5, status: 'confirmed',
            required_quantity: '7.200', packed_quantity: '8.700',
            quantity_variance: '1.500',
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
};

const sql = (c) => c.calls;
const wrote = (c) => c.calls.some((s) => /^UPDATE picking_slip_items/i.test(s));

const call = (client, over = {}) => {
  poolMock.connect.mockResolvedValueOnce(client);
  return pickingRepository.setItemStatus({
    slipId: 1, itemId: 5, status: 'confirmed', packedQuantity: 3,
    actorId: OWNER, ...over,
  });
};

beforeEach(() => vi.clearAllMocks());

describe('setItemStatus — authorisation happens before the write', () => {
  it('lets the assigned packer through', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OWNER });
    const result = await call(client);

    expect(result.item).toBeDefined();
    expect(wrote(client)).toBe(true);
    expect(sql(client)).toContain('COMMIT');
  });

  it('refuses a packer on someone else\'s pallet', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OTHER });
    const result = await call(client);

    expect(result).toMatchObject({ forbidden: true, assignedTo: OTHER });
  });

  it('WRITES NOTHING when it refuses — the actual defect', async () => {
    // Before the fix the UPDATE had already committed by the time the
    // 403 was raised, so a packer could overwrite a colleague's line
    // and merely be told they were not allowed to.
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OTHER });
    await call(client);

    expect(wrote(client)).toBe(false);
    expect(sql(client)).toContain('ROLLBACK');
    expect(sql(client)).not.toContain('COMMIT');
  });

  it('logs no audit event for a refused attempt', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OTHER });
    await call(client);

    expect(client.calls.some((s) => /INSERT INTO picking_events/i.test(s))).toBe(false);
  });

  it('refuses an unassigned pallet', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: null });
    const result = await call(client);

    expect(result.forbidden).toBe(true);
    expect(wrote(client)).toBe(false);
  });

  it('lets a manager override and write', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OTHER });
    const result = await call(client, { canOverride: true });

    expect(result.item).toBeDefined();
    expect(wrote(client)).toBe(true);
  });

  it('decides ownership inside the FOR UPDATE lock', async () => {
    // The lock must be taken before the decision, or a concurrent
    // reassignment could slip between the read and the write.
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OTHER });
    await call(client);

    const lockIdx     = sql(client).findIndex((s) => /FOR UPDATE/i.test(s));
    const rollbackIdx = sql(client).findIndex((s) => /^ROLLBACK/i.test(s));

    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(rollbackIdx).toBeGreaterThan(lockIdx);
  });

  it('still reports a missing slip before checking ownership', async () => {
    const client = makeClient(null);
    const result = await call(client);
    expect(result).toEqual({ notFound: true });
  });

  it('still reports a completed slip as locked, not forbidden', async () => {
    const client = makeClient({ id: 1, status: 'complete', assigned_to: OTHER });
    const result = await call(client);
    expect(result).toEqual({ locked: true });
  });

  it('always releases the connection', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OTHER });
    await call(client);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// ── Variance arithmetic ───────────────────────────────────────
// A confirm at a quantity other than the one on the slip is valid,
// but it has to be visible rather than counted as a clean confirm —
// dispatch re-checks quantities at the gate and needs to know where
// to look.
describe('setItemStatus — quantity variance', () => {
  it('asks Postgres for the difference rather than computing it in JS', async () => {
    // 8.7 - 7.2 in JS floats is 1.4999999999999991, and that is the
    // number that would land in the audit log and on the screen.
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OWNER });
    await call(client);

    const update = sql(client).find((s) => /^UPDATE picking_slip_items/i.test(s));
    expect(update).toMatch(/RETURNING \*, \(packed_quantity - required_quantity\) AS quantity_variance/i);
  });

  it('reports the exact difference the database returned', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OWNER });
    const result = await call(client);

    expect(result.variance).toEqual({ required: 7.2, packed: 8.7, difference: 1.5 });
  });

  it('reports no variance when the packed quantity matches', async () => {
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OWNER });
    client.query = vi.fn(async (s) => {
      client.calls.push(s.replace(/\s+/g, ' ').trim());
      if (/SELECT id, status, assigned_to FROM picking_slips/i.test(s)) {
        return { rows: [{ id: 1, status: 'in_progress', assigned_to: OWNER }] };
      }
      if (/UPDATE picking_slip_items/i.test(s)) {
        return { rows: [{ id: 5, status: 'confirmed', required_quantity: '7.200', packed_quantity: '7.200', quantity_variance: '0.000' }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const result = await call(client);

    expect(result.variance).toBeNull();
  });

  it('never reports a variance on a flagged line', async () => {
    // A flag already carries its own reason and shows as a
    // discrepancy; marking it as a variance too would double-count it.
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OWNER });
    const result = await call(client, { status: 'flagged', flagReason: 'Short quantity' });

    expect(result.variance).toBeNull();
  });

  it('does not leak quantity_variance into the returned item', async () => {
    // It is a computed column for the repository's own use — the API
    // response shape should not change because of it.
    const client = makeClient({ id: 1, status: 'in_progress', assigned_to: OWNER });
    const result = await call(client);

    expect(result.item).not.toHaveProperty('quantity_variance');
  });
});