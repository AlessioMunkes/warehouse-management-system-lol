// ─────────────────────────────────────────────────────────────
// server/__tests__/generateSlipsBatched.test.js
//
// Generating a cohort's slips costs the same handful of statements for
// two centres or two hundred. It used to be two or three per slip.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
const poolMock = { connect: vi.fn(async () => client), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: pickingRepository } = await import('../src/repositories/picking.repository.js');

const squash = (sql) => String(sql).replace(/\s+/g, ' ').trim();

// A database with `centres` centres. Those listed in `ownOrder` are not
// covered by the recipe and fall back to a standing order of two lines;
// those in `nothing` have neither.
const makeDb = ({ centres, recipe = true, ownOrder = [], nothing = [] }) => {
  const seen = [];
  client.query.mockReset();
  client.query.mockImplementation(async (sql, params) => {
    const t = squash(sql);
    seen.push({ t, params });
    if (/^INSERT INTO picking_slips/.test(t)) {
      return { rowCount: centres, rows: Array.from({ length: centres }, (_, i) => ({ id: 100 + i, ecd_id: 1 + i })) };
    }
    if (/FROM recipes r/.test(t)) {
      return { rows: recipe ? [{ id: 9, name: 'Summer', kind: 'summer', season_start_month: 1, season_start_day: 1, starts_on: null, ends_on: null, line_count: 3 },
        { id: 10, name: 'Winter', kind: 'winter', season_start_month: 1, season_start_day: 1, starts_on: null, ends_on: null, line_count: 0 }] : [] };
    }
    if (/FROM app_settings/.test(t)) return { rows: [{ value: '5' }] };
    if (/INSERT INTO picking_slip_items/.test(t) && /recipe_lines/.test(t)) {
      const [slipIds, ecdIds] = params;
      const rows = [];
      slipIds.forEach((id, i) => { if (!ownOrder.includes(ecdIds[i]) && !nothing.includes(ecdIds[i])) rows.push({ picking_slip_id: id }, { picking_slip_id: id }, { picking_slip_id: id }); });
      return { rows, rowCount: rows.length };
    }
    if (/INSERT INTO picking_slip_items/.test(t) && /ecd_order_lines/.test(t)) {
      const [slipIds, ecdIds] = params;
      const rows = [];
      slipIds.forEach((id, i) => { if (ownOrder.includes(ecdIds[i])) rows.push({ picking_slip_id: id }, { picking_slip_id: id }); });
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return seen;
};

beforeEach(() => { poolMock.connect.mockClear(); });

describe('generateSlips', () => {
  it('takes the same number of statements for 2 centres as for 200', async () => {
    const few = makeDb({ centres: 2 });
    await pickingRepository.generateSlips({ dispatchDate: '2026-10-13', cohort: 'tuesday', generatedBy: 1 });
    const fewCount = few.length;

    const many = makeDb({ centres: 200 });
    const result = await pickingRepository.generateSlips({ dispatchDate: '2026-10-13', cohort: 'tuesday', generatedBy: 1 });
    expect(result.created).toBe(200);
    expect(many.length).toBe(fewCount);
    expect(many.length).toBeLessThan(15);
  });

  it('gives every slip its recipe lines in one statement, and records one history line each', async () => {
    const seen = makeDb({ centres: 3 });
    const result = await pickingRepository.generateSlips({ dispatchDate: '2026-10-13', cohort: 'tuesday', generatedBy: 7 });

    const items = seen.filter((q) => /INSERT INTO picking_slip_items/.test(q.t));
    expect(items).toHaveLength(1);                                   // the recipe covered everyone
    expect(items[0].params[0]).toEqual([100, 101, 102]);
    expect(items[0].params[1]).toEqual([1, 2, 3]);

    const events = seen.filter((q) => /INSERT INTO picking_events/.test(q.t));
    expect(events).toHaveLength(1);
    const [slipIds, types, actor, details] = events[0].params;
    expect(slipIds).toEqual([100, 101, 102]);
    expect(types).toEqual(['generated', 'generated', 'generated']);
    expect(actor).toBe(7);
    expect(JSON.parse(details[0])).toEqual({ dispatch_date: '2026-10-13', item_count: 3, source: 'recipe', recipe: 'Summer' });
    expect(result.emptySlips).toEqual([]);
  });

  it('falls back to the standing order only for the centres the recipe left out, and reports the empty ones', async () => {
    const seen = makeDb({ centres: 4, ownOrder: [2], nothing: [4] });
    const result = await pickingRepository.generateSlips({ dispatchDate: '2026-10-13', cohort: 'tuesday', generatedBy: 1 });

    const fallback = seen.find((q) => /INSERT INTO picking_slip_items/.test(q.t) && /ecd_order_lines/.test(q.t));
    expect(fallback.params[0]).toEqual([101, 103]);                  // slips for centres 2 and 4 only
    expect(result.emptySlips).toEqual([{ slipId: 103, ecdId: 4 }]);

    const [slipIds, types, , details] = seen.find((q) => /INSERT INTO picking_events/.test(q.t)).params;
    expect(slipIds).toEqual([100, 101, 102, 103, 103]);
    expect(types).toEqual(['generated', 'generated', 'generated', 'generated', 'no_order_lines']);
    expect(JSON.parse(details[1])).toEqual({ dispatch_date: '2026-10-13', item_count: 2, source: 'standing_order' });
    expect(JSON.parse(details[3])).toMatchObject({ item_count: 0, source: 'standing_order' });
  });

  it('uses standing orders for everyone when no recipe applies', async () => {
    const seen = makeDb({ centres: 2, recipe: false, ownOrder: [1, 2] });
    await pickingRepository.generateSlips({ dispatchDate: '2026-10-13', cohort: 'tuesday', generatedBy: 1 });
    const items = seen.filter((q) => /INSERT INTO picking_slip_items/.test(q.t));
    expect(items).toHaveLength(1);
    expect(items[0].t).toMatch(/ecd_order_lines/);
  });

  it('does nothing more when no slip was created', async () => {
    const seen = makeDb({ centres: 0 });
    const result = await pickingRepository.generateSlips({ dispatchDate: '2026-10-13', cohort: 'tuesday', generatedBy: 1 });
    expect(result).toEqual({ created: 0, emptySlips: [] });
    expect(seen.some((q) => /picking_slip_items|picking_events/.test(q.t))).toBe(false);
  });
});
