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
//
// The balance is now summed by Postgres (`SET quantity_on_hand =
// quantity_on_hand + $1::numeric ... RETURNING`), so the fake has to
// answer that UPDATE the way the database would: exact decimal
// addition, rounded to the 3 decimal places the column declares, and
// handed back as a string.
const NUMERIC_SCALE = 3;   // matches NUMERIC(12,3) in schema.sql

const makeClient = ({ existing = null } = {}) => {
  const calls = [];
  // Tracks the balance across the INSERT-then-UPDATE path used for a
  // product's first movement.
  let balance = existing && existing !== 'no-product'
    ? Number(existing.quantity_on_hand)
    : 0;

  const client = {
    calls,
    release: vi.fn(),
    query: vi.fn(async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/SELECT quantity_on_hand, unit FROM stock_levels/i.test(sql)) {
        return { rows: existing && existing !== 'no-product' ? [existing] : [] };
      }
      if (/SELECT id FROM products/i.test(sql)) {
        return { rows: existing === 'no-product' ? [] : [{ id: 1 }] };
      }
      if (/UPDATE stock_levels/i.test(sql)) {
        balance = Number((balance + Number(params[0])).toFixed(NUMERIC_SCALE));
        return { rows: [{ quantity_on_hand: balance.toFixed(NUMERIC_SCALE) }], rowCount: 1 };
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

  it('adds the delta in SQL rather than writing a JS-computed balance', async () => {
    // This used to pass `before + delta` as the new balance. It now
    // passes the delta and lets Postgres add it to the stored value,
    // so NUMERIC precision is never routed through a binary float.
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 25, unit: 'kg' });

    const update = findSql(client, /UPDATE stock_levels/i);
    expect(update.params[0]).toBe(25);
    expect(update.sql).toMatch(/quantity_on_hand \+ \$1::numeric/i);
  });

  it('reads the new balance back from the database, not from JS', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '100', unit: 'kg' } });
    await adjustStock(client, { ...BASE, quantityDelta: 25, unit: 'kg' });

    const update = findSql(client, /UPDATE stock_levels/i);
    expect(update.sql).toMatch(/RETURNING quantity_on_hand/i);
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

// ── Delta validation (was DEFECT E) ───────────────────────────
describe('adjustStock — the delta must be a finite number', () => {
  const existing = { quantity_on_hand: '100', unit: 'kg' };

  it.each([
    ['undefined', undefined],
    ['null',      null],
    ['a word',    'twenty'],
    ['NaN',       NaN],
    ['Infinity',  Infinity],
    ['-Infinity', -Infinity],
    ['an object', {}],
  ])('rejects %s', async (_label, quantityDelta) => {
    const client = makeClient({ existing });
    await expect(adjustStock(client, { ...BASE, quantityDelta, unit: 'kg' }))
      .rejects.toThrow(/must be a finite number/);
  });

  it('writes nothing when the delta is invalid', async () => {
    // Postgres NUMERIC accepts 'NaN', and NaN + anything is NaN — so a
    // single bad write would poison the product's balance permanently.
    // Worse, Postgres sorts NaN as GREATER than every real value, so the
    // row would never flag as low stock or as a shortfall.
    const client = makeClient({ existing });
    await expect(adjustStock(client, { ...BASE, quantityDelta: undefined, unit: 'kg' }))
      .rejects.toThrow();

    expect(sqlOf(client).some((s) => /^(INSERT|UPDATE)/i.test(s))).toBe(false);
  });

  it('still accepts a numeric string and zero', async () => {
    for (const d of ['25', 0, -0, 2.5]) {
      const client = makeClient({ existing });
      await expect(adjustStock(client, { ...BASE, quantityDelta: d, unit: 'kg' }))
        .resolves.toBeDefined();
    }
  });

  it('rejects an invalid product id before touching the database', async () => {
    const client = makeClient({ existing });
    await expect(adjustStock(client, { ...BASE, productId: undefined, quantityDelta: 5, unit: 'kg' }))
      .rejects.toThrow(/valid product id/);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('records the validated number in the ledger, not the raw input', async () => {
    const client = makeClient({ existing });
    await adjustStock(client, { ...BASE, quantityDelta: '-30', unit: 'kg' });

    const qty = findSql(client, /INSERT INTO stock_movements/i).params[1];
    expect(qty).toBe(-30);
    expect(typeof qty).toBe('number');
  });
});

// ── Regression — previously known defect, now fixed ───────────
describe('regression — balances are summed in NUMERIC, not JS floats', () => {
  it('adds 0.1 and 0.2 without binary float error', async () => {
    // Was DEFECT F. quantity_on_hand is NUMERIC precisely so decimal
    // arithmetic is exact, but the sum used to be done in JS and
    // written back, so 0.1 + 0.2 stored 0.30000000000000004. Over a
    // season of decanting movements the ledger and the balance drifted
    // apart. Postgres does the addition now.
    const client = makeClient({ existing: { quantity_on_hand: '0.1', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 0.2, unit: 'kg' });

    expect(result.after).toBe(0.3);
  });

  it('stays exact across a run of decimal movements', async () => {
    // Ten 0.1 kg movements should land on 1, not 0.9999999999999999.
    let balance = '0';
    for (let i = 0; i < 10; i += 1) {
      const client = makeClient({ existing: { quantity_on_hand: balance, unit: 'kg' } });
      const result = await adjustStock(client, { ...BASE, quantityDelta: 0.1, unit: 'kg' });
      balance = String(result.after);
    }
    expect(Number(balance)).toBe(1);
  });

  it('still reports the balance before the movement', async () => {
    const client = makeClient({ existing: { quantity_on_hand: '0.1', unit: 'kg' } });
    const result = await adjustStock(client, { ...BASE, quantityDelta: 0.2, unit: 'kg' });

    expect(result.before).toBe(0.1);
  });
});
// ─────────────────────────────────────────────────────────────
// getManifest — the manifest must agree with the packing screen
//
// committedStock.sql.js names three call sites that need its exact
// definition: the packing availability check, the dispatch gate view,
// and this manifest. The manifest did not import it, so a pallet that
// was packed, closed and standing in the staging area still counted
// as available — and packing refused to commit rice the inventory
// screen was visibly promising.
//
// These assert against the QUERY TEXT rather than results, because
// the regression to guard against is structural: someone rewriting
// this query without the join. A result-shaped test would pass on a
// query that had silently dropped it.
// ─────────────────────────────────────────────────────────────
describe('getManifest — committed stock is part of the answer', () => {
  const runManifest = async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });
    await stockRepository.getManifest();
    return poolMock.query.mock.calls[0][0].replace(/\s+/g, ' ');
  };

  it('joins the shared committed-stock definition', async () => {
    const text = await runManifest();
    // The distinguishing tables of committedStockSql. If these are
    // gone, the manifest has drifted back to counting staged pallets
    // as available.
    expect(text).toMatch(/picking_slip_items/);
    expect(text).toMatch(/dispatch_events/);
  });

  it('returns on hand, committed and available as separate columns', async () => {
    const text = await runManifest();
    expect(text).toMatch(/AS quantity_on_hand/i);
    expect(text).toMatch(/AS committed/i);
    expect(text).toMatch(/AS available/i);
  });

  it('derives available as on hand minus committed', async () => {
    const text = await runManifest();
    expect(text).toMatch(
      /COALESCE\(sl\.quantity_on_hand, 0\) - COALESCE\(c\.committed, 0\)\)::numeric AS available/i
    );
  });

  // The badges have to come off available, not on hand. Deriving them
  // from on hand is what let the manifest call a fully-committed
  // product "in stock".
  it('computes is_shortfall and is_low_stock from available', async () => {
    const text = await runManifest();
    const shortfall = text.match(/(\S.*?)\s*AS is_shortfall/i)[1];
    const lowStock  = text.match(/(\S.*?)\s*AS is_low_stock/i)[1];
    expect(shortfall).toMatch(/c\.committed/);
    expect(lowStock).toMatch(/c\.committed/);
  });

  it('still lists inactive products out and keeps the name ordering', async () => {
    const text = await runManifest();
    expect(text).toMatch(/WHERE p\.is_active = true/i);
    expect(text).toMatch(/ORDER BY p\.name ASC/i);
  });

  // A product with no stock_levels row must still appear, at zero,
  // rather than dropping off the screen.
  it('keeps every active product with LEFT JOINs', async () => {
    const text = await runManifest();
    expect(text).toMatch(/LEFT JOIN stock_levels/i);
    expect(text).toMatch(/LEFT JOIN \(\s*SELECT/i);
  });
});