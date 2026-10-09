// ─────────────────────────────────────────────────────────────
// server/__tests__/communityRequestStock.test.js
//
// How benevolent requests meet stock, without a database:
//   - the committed-stock SQL (one extra branch, and the pallets-only
//     variant the packing check uses);
//   - planShortage: which approved requests give way, in what order;
//   - recheckProducts: flags, releases, notifies ONCE, never throws;
//   - the two hooks (a pallet packed, stock going down) and the
//     priority rule (the packing check never sees a benevolent
//     reservation).
//
// The same behaviour against real SQL is in
// __tests__/intergration/communityRequest.intergration.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { committedStockSql } = await import('../src/repositories/committedStock.sql.js');
const stockRepo = await import('../src/repositories/communityRequestStock.repository.js');
const {
  planShortage, recheckProducts,
  SHORTAGE_CANDIDATES_SQL, SHORTAGE_STATE_SQL, FLAG_LINE_SQL, FLAG_REQUEST_SQL, LOCK_STOCK_SQL,
  PRODUCTS_WITH_APPROVED_LINES_SQL,
} = stockRepo;
const { default: stockRepository } = await import('../src/repositories/stock.repository.js');
const { default: pickingRepository } = await import('../src/repositories/picking.repository.js');

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

describe('committedStockSql', () => {
  it('counts packed pallets AND approved benevolent requests by default', () => {
    const sql = squash(committedStockSql());
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('FROM community_request_items');
    expect(sql).toContain("cr.outcome = 'approved'");
    expect(sql).toContain('cri.short_at IS NULL');
    expect(sql).toContain('cri.quantity_approved - cri.quantity_released');
    expect(sql).toContain("ps.status = 'complete'");
  });

  it('the packing-check variant has no benevolent branch at all', () => {
    const sql = squash(committedStockSql({ includeBenevolent: false }));
    expect(sql).not.toContain('community_request');
    expect(sql).toContain("ps.status = 'complete'");
  });

  it('can leave one slip and one request out of the total', () => {
    const sql = squash(committedStockSql({ excludeSlipParam: '$1', excludeRequestParam: '$2' }));
    expect(sql).toContain('ps.id <> $1');
    expect(sql).toContain('cr.id <> $2');
  });

  it('only an approved request reserves: declined, fulfilled and pending ones fall out by status', () => {
    // The reservation is derived from the status, so declining or
    // confirming releases it with no write of its own.
    expect(squash(committedStockSql())).toMatch(/cr\.outcome = 'approved'/);
    expect(squash(committedStockSql())).not.toMatch(/pending|declined|fulfilled/);
  });
});

describe('planShortage', () => {
  const lines = (...reserved) => reserved.map((r, i) => ({ line_id: i + 1, request_id: 100 + i, reserved: r }));

  it('flags nothing while the numbers fit', () => {
    expect(planShortage({ onHand: 10, pallets: 4, benevolent: 6, candidates: lines(3, 3) })).toEqual([]);
  });

  it('flags the first candidate (the most recently approved) and stops once it fits', () => {
    const flagged = planShortage({ onHand: 10, pallets: 6, benevolent: 8, candidates: lines(4, 4) });
    expect(flagged.map((l) => l.request_id)).toEqual([100]);
  });

  it('keeps going while still short', () => {
    const flagged = planShortage({ onHand: 10, pallets: 9, benevolent: 8, candidates: lines(4, 4) });
    expect(flagged.map((l) => l.request_id)).toEqual([100, 101]);
  });

  it('releases everything it can when pallets alone exceed stock', () => {
    const flagged = planShortage({ onHand: 5, pallets: 9, benevolent: 8, candidates: lines(4, 4) });
    expect(flagged).toHaveLength(2);
  });

  it('handles exactly zero as fitting', () => {
    expect(planShortage({ onHand: 10, pallets: 6, benevolent: 4, candidates: lines(4) })).toEqual([]);
  });

  it('accepts numeric strings, as pg returns NUMERIC', () => {
    const flagged = planShortage({ onHand: '10.000', pallets: '6.000', benevolent: '8.000', candidates: lines('4.000') });
    expect(flagged).toHaveLength(1);
  });
});

// ── recheckProducts ───────────────────────────────────────────
// A tiny in-memory model of the rows the function reads and writes,
// answering by the exported SQL text.
const makeDb = ({ onHand, pallets = 0, lines }) => {
  const state = {
    onHand, pallets,
    lines: lines.map((l) => ({ short_at: null, ...l })),      // { line_id, request_id, product_id, reserved, approvedAt }
    requestFlagged: new Set(),
    notifications: [],
    log: [],
  };
  const flaggedLines = () => state.lines.filter((l) => l.short_at);
  const query = vi.fn(async (sql, params) => {
    const text = squash(sql);
    state.log.push(text.split(' ')[0]);
    if (text === squash(PRODUCTS_WITH_APPROVED_LINES_SQL)) {
      const ids = [...new Set(state.lines.filter((l) => !l.short_at && params[0].includes(l.product_id)).map((l) => l.product_id))];
      return { rows: ids.map((product_id) => ({ product_id })) };
    }
    if (text === squash(SHORTAGE_CANDIDATES_SQL)) {
      const rows = state.lines
        .filter((l) => !l.short_at && l.product_id === params[0])
        .sort((a, b) => b.approvedAt - a.approvedAt)
        .map((l) => ({ line_id: l.line_id, request_id: l.request_id, reserved: String(l.reserved) }));
      return { rows };
    }
    if (text === squash(LOCK_STOCK_SQL)) return { rows: [] };
    if (text === squash(SHORTAGE_STATE_SQL)) {
      const benevolent = state.lines.filter((l) => !l.short_at).reduce((s, l) => s + l.reserved, 0);
      return { rows: [{ quantity_on_hand: String(state.onHand), pallets: String(state.pallets), benevolent: String(benevolent) }] };
    }
    if (text === squash(FLAG_LINE_SQL)) {
      state.lines.find((l) => l.line_id === params[0]).short_at = 'now';
      return { rowCount: 1 };
    }
    if (text === squash(FLAG_REQUEST_SQL)) {
      if (state.requestFlagged.has(params[0])) return { rowCount: 0, rows: [] };
      state.requestFlagged.add(params[0]);
      return { rowCount: 1, rows: [{ id: params[0] }] };
    }
    if (/^INSERT INTO notifications/.test(text)) {
      state.notifications.push({ type: params[0], title: params[1], body: params[2], entityId: params[4], roles: params[5] });
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };            // SAVEPOINT / RELEASE / ROLLBACK TO
  });
  return { state, client: { query }, flaggedLines };
};

const req = (id, productId, reserved, approvedAt) =>
  ({ line_id: id, request_id: id, product_id: productId, reserved, approvedAt });

describe('recheckProducts', () => {
  it('does nothing — and reads no stock — when no approved request holds the product', async () => {
    const { client: c } = makeDb({ onHand: 1, pallets: 5, lines: [] });
    expect(await recheckProducts(c, [5])).toEqual([]);
    expect(c.query.mock.calls.some(([s]) => squash(s) === squash(SHORTAGE_STATE_SQL))).toBe(false);
  });

  it('flags the most recently approved request first, releases its line, and notifies managers and admins once', async () => {
    const { client: c, state } = makeDb({
      onHand: 10, pallets: 4,
      lines: [req(1, 5, 4, 1000), req(2, 5, 4, 2000)],   // request 2 approved later
    });
    const flagged = await recheckProducts(c, [5], { cause: 'pallet' });

    expect(flagged).toEqual([2]);
    expect(state.lines.find((l) => l.line_id === 2).short_at).toBeTruthy();
    expect(state.lines.find((l) => l.line_id === 1).short_at).toBeNull();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: 'community_request_items_short', entityId: 2, roles: ['manager', 'admin'],
      body: 'Pallet packing used stock set aside for benevolent request #2. Choose other items.',
    });
  });

  it('flags several when needed, one notification each', async () => {
    const { client: c, state } = makeDb({
      onHand: 10, pallets: 9,
      lines: [req(1, 5, 4, 1000), req(2, 5, 4, 2000)],
    });
    expect(await recheckProducts(c, [5])).toEqual([2, 1]);
    expect(state.notifications).toHaveLength(2);
  });

  it('is silent while the numbers fit, and when run again after flagging', async () => {
    const { client: c, state } = makeDb({ onHand: 10, pallets: 4, lines: [req(1, 5, 4, 1000), req(2, 5, 4, 2000)] });
    await recheckProducts(c, [5]);
    await recheckProducts(c, [5]);
    await recheckProducts(c, [5]);
    expect(state.notifications).toHaveLength(1);
  });

  it('a second product on an already-flagged request does not send a second notification', async () => {
    const { client: c, state } = makeDb({
      onHand: 2, pallets: 1,
      lines: [{ ...req(1, 5, 4, 1000) }, { line_id: 3, request_id: 1, product_id: 6, reserved: 4, approvedAt: 1000 }],
    });
    await recheckProducts(c, [5]);
    await recheckProducts(c, [6]);
    expect(state.notifications).toHaveLength(1);
  });

  it('uses a calmer message when it was a stock change rather than a pallet', async () => {
    const { client: c, state } = makeDb({ onHand: 1, pallets: 0, lines: [req(1, 5, 4, 1000)] });
    await recheckProducts(c, [5], { cause: 'stock' });
    expect(state.notifications[0].body).toMatch(/Stock changed/);
    expect(state.notifications[0].body).toMatch(/#1/);
  });

  it('never throws: a fault is rolled back to its savepoint and logged', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = [];
    const c = {
      query: vi.fn(async (sql) => {
        const t = squash(sql);
        calls.push(t);
        if (t === squash(PRODUCTS_WITH_APPROVED_LINES_SQL)) return { rows: [{ product_id: 5 }] };
        if (t === squash(SHORTAGE_CANDIDATES_SQL)) throw new Error('boom');
        return { rows: [], rowCount: 0 };
      }),
    };
    await expect(recheckProducts(c, [5])).resolves.toEqual([]);
    expect(calls).toContain('ROLLBACK TO SAVEPOINT community_request_shortage');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('checks every product the slow way when the pre-check itself fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const asked = [];
    const c = {
      query: vi.fn(async (sql, params) => {
        const t = squash(sql);
        if (t === squash(PRODUCTS_WITH_APPROVED_LINES_SQL)) throw new Error('boom');
        if (t === squash(SHORTAGE_CANDIDATES_SQL)) asked.push(params[0]);
        return { rows: [], rowCount: 0 };
      }),
    };
    await expect(recheckProducts(c, [9, 3])).resolves.toEqual([]);
    expect(asked).toEqual([3, 9]);
    spy.mockRestore();
  });

  it('asks once which products a request is waiting on, then checks only those, in id order', async () => {
    const { client: c } = makeDb({ onHand: 10, lines: [req(1, 9, 1, 1000), req(2, 3, 1, 2000)] });
    await recheckProducts(c, [9, 3, 3, 7, 'x', 0]);
    const pre = c.query.mock.calls.filter(([s]) => squash(s) === squash(PRODUCTS_WITH_APPROVED_LINES_SQL));
    expect(pre).toHaveLength(1);
    expect(pre[0][1]).toEqual([[3, 7, 9]]);
    const asked = c.query.mock.calls
      .filter(([s]) => squash(s) === squash(SHORTAGE_CANDIDATES_SQL))
      .map(([, p]) => p[0]);
    expect(asked).toEqual([3, 9]);          // 7 has no request against it
  });

  it('a pallet of many products with no request against them costs one query, not three each', async () => {
    const { client: c } = makeDb({ onHand: 10, lines: [] });
    await recheckProducts(c, Array.from({ length: 21 }, (_, i) => i + 1));
    expect(c.query.mock.calls.length).toBe(3);   // savepoint, the one question, release
  });
});

// ── The hooks ─────────────────────────────────────────────────
describe('adjustStock hook', () => {
  const makeStockClient = () => {
    const queries = [];
    return {
      queries,
      query: vi.fn(async (sql, params) => {
        const t = squash(sql);
        queries.push(t);
        if (/FROM stock_levels sl JOIN products p/.test(t)) {
          return { rows: [{ quantity_on_hand: '10', unit: 'kg', reorder_threshold: '0', product_name: 'Rice' }] };
        }
        if (/^UPDATE stock_levels/.test(t)) return { rows: [{ quantity_on_hand: String(10 + Number(params[0])) }] };
        return { rows: [], rowCount: 1 };
      }),
    };
  };
  const ran = (c) => c.queries.some((t) => t === squash(PRODUCTS_WITH_APPROVED_LINES_SQL));

  it('re-checks the product when stock goes down', async () => {
    const c = makeStockClient();
    await stockRepository.adjustStock(c, { productId: 5, quantityDelta: -3, unit: 'kg', movementType: 'wastage', performedBy: 1 });
    expect(ran(c)).toBe(true);
  });

  it('does not bother when stock goes up', async () => {
    const c = makeStockClient();
    await stockRepository.adjustStock(c, { productId: 5, quantityDelta: 3, unit: 'kg', movementType: 'received', performedBy: 1 });
    expect(ran(c)).toBe(false);
  });
});

describe('PALLETS FIRST — completeSlip', () => {
  const slipRow = { id: 132, status: 'in_progress', assigned_to: 3, assigned_volunteer_id: null };
  let sqlSeen;

  beforeEach(() => {
    sqlSeen = [];
    client.query.mockReset();
    poolMock.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      const t = squash(sql);
      sqlSeen.push(t);
      if (/SELECT id, status, assigned_to/.test(t)) return { rows: [slipRow] };
      if (/SELECT COUNT\(\*\)::int AS n FROM picking_slip_items/.test(t)) return { rows: [{ n: 0 }] };
      if (/WITH packed AS/.test(t)) {
        return { rows: [{ product_id: 5, packed_quantity: '6', units: ['kg'], product_name: 'Rice',
          quantity_on_hand: '10', ledger_unit: 'kg', committed: '0', available: '10', is_shortfall: false }] };
      }
      if (/^UPDATE picking_slips/.test(t)) return { rows: [{ id: 132, status: 'complete' }] };
      return { rows: [], rowCount: 0 };
    });
  });

  it('the packing availability check never sees a benevolent reservation', async () => {
    await pickingRepository.completeSlip({ slipId: 132, actorId: 3, actor: { type: 'user', id: 3 }, canOverride: true });
    const check = sqlSeen.find((t) => /WITH packed AS/.test(t));
    expect(check).toBeTruthy();
    expect(check).not.toContain('community_request');
  });

  it('after packing, it re-checks the packed products for benevolent shortages (in the same transaction, before COMMIT)', async () => {
    await pickingRepository.completeSlip({ slipId: 132, actorId: 3, actor: { type: 'user', id: 3 }, canOverride: true });
    const recheck = sqlSeen.indexOf(squash(PRODUCTS_WITH_APPROVED_LINES_SQL));
    const commit = sqlSeen.indexOf('COMMIT');
    expect(recheck).toBeGreaterThan(-1);
    expect(recheck).toBeLessThan(commit);
  });
});
