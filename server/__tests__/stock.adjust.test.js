// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.adjust.test.js
//
// Tests for adjustStock — the single write path for every change to
// quantity_on_hand. Procurement, picking and manual adjustments all
// funnel through it, so a bug here corrupts stock everywhere.
//
// No database. adjustStock already takes a `client` as its first
// argument, so a fake client that records queries is enough to test
// the arithmetic, the lock ordering and the write sequence. The pool
// in config/db.js is mocked because importing it for real calls
// process.exit(1) when DB_* env vars are absent, which would kill the
// vitest process outright with no failure message.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: stockRepository } = await import('../src/repositories/stock.repository.js');
const { adjustStock, manualAdjust } = stockRepository;

// ── Fake client ───────────────────────────────────────────────
// pg returns NUMERIC columns as strings, so `existing` mirrors that.
const makeClient = ({ existing = null } = {}) => {
  const calls = [];
  const client = {
    calls,
    release: vi.fn(),
    query: vi.fn(async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/SELECT quantity_on_hand, unit FROM stock_levels/i.test(sql)) {
        return { rows: existing ? [existing] : [] };
      }
      if (/SELECT id FROM products/i.test(sql)) {
        return { rows: existing === 'no-product' ? [] : [{ id: 1 }] };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  return client;
};

const sqlOf   = (client) => client.calls.map((c) => c.sql);
const findSql = (client, re) => client.calls.find((c) => re.test(c.sql));

const BASE = { productId: 1, movementType: 'adjustment', performedBy: 42 };

beforeEach(() => vi.clearAllMocks());

// ── Arithmetic ────────────────────────────────────────────────
describe('adjustStock — arithmetic', () => {
  it('adds a positive delta to the existing balance', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 25, unit: 'kg' });

    expect(result.before).toBe(100);
    expect(result.after).toBe(125);
  });

  it('subtracts a negative delta', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: -30, unit: 'kg' });

    expect(result.after).toBe(70);
  });

  it('converts pg\'s NUMERIC string into a real number', async () => {
    // node-postgres hands back NUMERIC as a string. Without the explicit
    // Number() cast, '100' + 25 would concatenate to '10025'.
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 25, unit: 'kg' });

    expect(typeof result.before).toBe('number');
    expect(typeof result.after).toBe('number');
    expect(result.after).not.toBe('10025');
  });

  it('coerces a numeric-string delta', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: '25', unit: 'kg' });

    expect(result.after).toBe(125);
  });

  it('handles decimal quantities', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '10.5', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 2.25, unit: 'kg' });

    expect(result.after).toBeCloseTo(12.75, 6);
  });

  it('writes the computed balance, not the delta, to stock_levels', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 25, unit: 'kg' });

    const update = findSql(client, /UPDATE stock_levels/i);
    expect(update.params[0]).toBe(125);
  });
});

// ── Never blocks ──────────────────────────────────────────────
describe('adjustStock — negative balances are a signal, not an error', () => {
  it('allows the balance to go below zero', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '2', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: -5, unit: 'kg' });

    expect(result.after).toBe(-3);
  });

  it('flags the shortfall rather than throwing', async () => {
    // Food distribution is never blocked by a system count being off.
    const client = makeClient({ existing: { quantity_on_hand: '2', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: -5, unit: 'kg' });

    expect(result.isShortfall).toBe(true);
  });

  it('still writes the movement when the result is negative', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '2', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: -5, unit: 'kg' });

    expect(findSql(client, /INSERT INTO stock_movements/i)).toBeDefined();
  });

  it('does not flag a shortfall when the balance lands exactly on zero', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '5', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: -5, unit: 'kg' });

    expect(result.after).toBe(0);
    expect(result.isShortfall).toBe(false);
  });

  it('does not flag a shortfall on a normal positive balance', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: -1, unit: 'kg' });

    expect(result.isShortfall).toBe(false);
  });
});

// ── Locking and write order ───────────────────────────────────
describe('adjustStock — locking and write order', () => {
  it('locks the stock_levels row FOR UPDATE before writing', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    expect(client.calls[0].sql).toMatch(/SELECT quantity_on_hand, unit FROM stock_levels .* FOR UPDATE/i);
  });

  it('reads, then updates the level, then appends the movement', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    const order = sqlOf(client);
    expect(order[0]).toMatch(/SELECT quantity_on_hand/i);
    expect(order[1]).toMatch(/UPDATE stock_levels/i);
    expect(order[2]).toMatch(/INSERT INTO stock_movements/i);
  });

  it('uses the caller\'s client, never opening its own connection', async () => {
    // It must join the caller's transaction — completeSlip depends on
    // stock and slip state committing or rolling back together.
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    expect(poolMock.connect).not.toHaveBeenCalled();
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('issues no BEGIN or COMMIT of its own', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    expect(sqlOf(client).some((s) => /^(BEGIN|COMMIT|ROLLBACK)/i.test(s))).toBe(false);
  });
});

// ── First movement for a product ──────────────────────────────
describe('adjustStock — a product with no stock row yet', () => {
  it('requires a unit for the first ever movement', async () => {
    const client = makeClient({ existing: null });
    await expect(adjustStock(client, { ...BASE, quantityDelta: 10 }))
      .rejects.toThrow(/Unit is required/);
  });

  it('does not write anything when the unit is missing', async () => {
    const client = makeClient({ existing: null });
    await expect(adjustStock(client, { ...BASE, quantityDelta: 10 })).rejects.toThrow();

    // Anchored to the start of the statement — an unanchored /UPDATE/
    // would match the "FOR UPDATE" in the SELECT lock.
    expect(sqlOf(client).some((s) => /^(INSERT|UPDATE)/i.test(s))).toBe(false);
  });

  it('seeds a stock_levels row at zero, then applies the delta', async () => {
    const client = makeClient({ existing: null });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 10, unit: 'kg' });

    const insert = findSql(client, /INSERT INTO stock_levels/i);
    expect(insert.params).toEqual([1, 'kg']);
    expect(result.before).toBe(0);
    expect(result.after).toBe(10);
  });

  it('adopts the caller\'s unit as the product\'s established unit', async () => {
    const client = makeClient({ existing: null });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 10, unit: 'crates' });

    expect(result.isUnitMismatch).toBe(false);
    expect(findSql(client, /INSERT INTO stock_movements/i).params[2]).toBe('crates');
  });
});

// ── Unit handling ─────────────────────────────────────────────
describe('adjustStock — unit reconciliation', () => {
  const existing = { quantity_on_hand: '100', unit: 'kg' };

  it('flags a mismatch without rejecting the movement', async () => {
    const client = makeClient({ existing });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'crates' });

    expect(result.isUnitMismatch).toBe(true);
    expect(result.after).toBe(105);
  });

  it('keeps the ledger\'s established unit so the total never drifts', async () => {
    const client = makeClient({ existing });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'crates' });

    expect(findSql(client, /INSERT INTO stock_movements/i).params[2]).toBe('kg');
  });

  it('reports no mismatch when the units agree', async () => {
    const client = makeClient({ existing });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    expect(result.isUnitMismatch).toBe(false);
  });

  it('reports no mismatch when the caller omits the unit', async () => {
    const client = makeClient({ existing });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 5 });

    expect(result.isUnitMismatch).toBe(false);
    expect(findSql(client, /INSERT INTO stock_movements/i).params[2]).toBe('kg');
  });
});

// ── The audit ledger ──────────────────────────────────────────
describe('adjustStock — the movement row', () => {
  const existing = { quantity_on_hand: '100', unit: 'kg' };

  it('records the delta, not the resulting balance', async () => {
    // stock_movements is an append-only ledger of changes; storing the
    // balance would make the history impossible to replay.
    const client = makeClient({ existing });
    await adjustStock(client, { ...BASE, quantityDelta: -30, unit: 'kg' });

    expect(findSql(client, /INSERT INTO stock_movements/i).params[1]).toBe(-30);
  });

  it('records the full provenance of the movement', async () => {
    const client = makeClient({ existing });
    await adjustStock(client, {
      productId: 1, quantityDelta: -12, unit: 'kg',
      movementType: 'picked', referenceType: 'picking_slip', referenceId: 77,
      reason: null, performedBy: 42,
    });

    const [productId, qty, unit, type, refType, refId, reason, by] =
      findSql(client, /INSERT INTO stock_movements/i).params;

    expect({ productId, qty, unit, type, refType, refId, reason, by }).toEqual({
      productId: 1, qty: -12, unit: 'kg', type: 'picked',
      refType: 'picking_slip', refId: 77, reason: null, by: 42,
    });
  });

  it('defaults reference and reason to null when not supplied', async () => {
    const client = makeClient({ existing });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    const params = findSql(client, /INSERT INTO stock_movements/i).params;
    expect(params[4]).toBeNull();   // reference_type
    expect(params[5]).toBeNull();   // reference_id
    expect(params[6]).toBeNull();   // reason
  });

  it('attributes every movement to a user', async () => {
    const client = makeClient({ existing });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg', performedBy: 7 });

    expect(findSql(client, /INSERT INTO stock_movements/i).params[7]).toBe(7);
  });

  it('writes exactly one movement row per call', async () => {
    const client = makeClient({ existing });
    await adjustStock(client, { ...BASE, quantityDelta: 5, unit: 'kg' });

    expect(sqlOf(client).filter((s) => /INSERT INTO stock_movements/i.test(s))).toHaveLength(1);
  });
});

// ── manualAdjust ──────────────────────────────────────────────
describe('manualAdjust — own transaction', () => {
  const runWith = async (client, args = {}) => {
    poolMock.connect.mockResolvedValueOnce(client);
    return manualAdjust({
      productId: 1, quantityDelta: 5, unit: 'kg',
      reason: 'Recount after spillage', performedBy: 42, ...args,
    });
  };

  it('wraps the work in BEGIN and COMMIT', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await runWith(client);

    const order = sqlOf(client);
    expect(order[0]).toMatch(/^BEGIN/i);
    expect(order[order.length - 1]).toMatch(/^COMMIT/i);
  });

  it('always releases the connection', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await runWith(client);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('checks the product is real and active before writing', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await runWith(client);

    const check = findSql(client, /SELECT id FROM products/i);
    expect(check.sql).toMatch(/is_active = true/i);
  });

  it('rolls back and reports a missing product without writing', async () => {
    const client = makeClient({ existing: 'no-product' });
    const result = await runWith(client);

    expect(result).toEqual({ productNotFound: true });
    expect(sqlOf(client)).toContain('ROLLBACK');
    expect(findSql(client, /INSERT INTO stock_movements/i)).toBeUndefined();
  });

  it('stamps the movement as a manual adjustment for the audit trail', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await runWith(client);

    const params = findSql(client, /INSERT INTO stock_movements/i).params;
    expect(params[3]).toBe('adjustment');
    expect(params[4]).toBe('manual_adjustment');
    expect(params[6]).toBe('Recount after spillage');
  });

  it('rolls back and rethrows when the write fails midway', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    client.query.mockImplementationOnce(async () => ({ rows: [] }))          // BEGIN
                .mockImplementationOnce(async () => ({ rows: [{ id: 1 }] })) // product check
                .mockImplementationOnce(async () => { throw new Error('deadlock detected'); });

    poolMock.connect.mockResolvedValueOnce(client);
    await expect(manualAdjust({
      productId: 1, quantityDelta: 5, unit: 'kg', reason: 'x', performedBy: 42,
    })).rejects.toThrow('deadlock detected');

    expect(client.release).toHaveBeenCalled();
  });

  it('returns the adjustStock outcome to the caller', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '2', unit: 'kg' } });
    const result = await runWith(client, { quantityDelta: -5 });

    expect(result).toMatchObject({ before: 2, after: -3, isShortfall: true });
  });
});

// ── Known defects ─────────────────────────────────────────────
describe.skip('known defects — un-skip once fixed', () => {
  it('DEFECT E: a non-numeric delta writes NaN into the balance', async () => {
    // adjustStock is described as the single write path, but it never
    // validates quantityDelta. Number(undefined) is NaN, NaN < 0 is
    // false so isShortfall stays false, and Postgres NUMERIC accepts
    // 'NaN' — so the product's balance becomes NaN permanently and
    // every later adjustment stays NaN. stock.service.js guards the
    // manual path, but picking and procurement call adjustStock direct.
    // Fix: validate Number.isFinite(quantityDelta) at the top.
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });

    await expect(adjustStock(client, { ...BASE, quantityDelta: undefined, unit: 'kg' }))
      .rejects.toThrow();
  });

  it('DEFECT F: balances are computed in JS floats, not NUMERIC', async () => {
    // quantity_on_hand is NUMERIC precisely so decimal arithmetic is
    // exact, but the sum is done in JS and written back, so binary
    // float error accumulates: 0.1 + 0.2 stores 0.30000000000000004.
    // Over a season of decanting movements the ledger and the balance
    // drift apart.
    // Fix: let Postgres do the sum —
    //   SET quantity_on_hand = quantity_on_hand + $1::numeric
    // and read the new value back with RETURNING.
    const client = makeClient({ existing: { quantity_on_hand: '0.1', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 0.2, unit: 'kg' });

    expect(result.after).toBe(0.3);
  });
});