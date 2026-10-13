// ─────────────────────────────────────────────────────────────
// server/__tests__/integration/stockCover.integration.test.js
//
// The stock cover inputs query (stockCover.repository.js) against a
// REAL Postgres: planned demand made the way slips are made, units
// turned into the stock unit (or counted when they cannot be),
// committed stock, open orders with follow-ups and part receipts, and
// the three kinds of lead time. A mock never sees the SQL, so this is
// the check that it runs and adds up.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses,
// so it SKIPS unless DATABASE_URL points at localhost:
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmstest DB_SSL=false JWT_SECRET=x \
//     npx vitest run --config vitest.integration.config.js stockCover
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetTables } from '../helpers/resetTables.js';

const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, loadStockCover, todayInSAST, addDays;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ loadStockCover, todayInSAST } = await import('../../src/repositories/stockCover.repository.js'));
  ({ addDays } = await import('../../src/features/stock/stockCover.js'));
}

const TABLES = [
  'stock_movements', 'delivery_note_items', 'delivery_notes', 'purchase_order_items', 'purchase_orders',
  'supplier_products', 'suppliers', 'community_request_items', 'community_requests',
  'picking_slip_items', 'picking_slips', 'recipe_own_order_centres', 'ecd_order_lines',
  'recipe_lines', 'recipes', 'ecd_centres', 'stock_levels', 'products',
];
const SETTING_KEYS = ['units.crateKg', 'units.bagKg', 'recipes.childBand'];
const TODAY = `(now() AT TIME ZONE 'Africa/Johannesburg')::date`;

const q = (sql, params) => pool.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

let savedSettings = [];
let cover;
const item = (name) => cover.items.find((i) => i.name === name);

describe.skipIf(!LOCAL)('stock cover against a real database', () => {
  beforeAll(async () => {
    savedSettings = (await q('SELECT key, value FROM app_settings WHERE key = ANY($1::text[])', [SETTING_KEYS])).rows;
    await q('DELETE FROM app_settings WHERE key = ANY($1::text[])', [SETTING_KEYS]);
    await resetTables(pool, TABLES);

    // A crate weighs 10 kg; nobody has said what a bag weighs. Bands of 5.
    await q(`INSERT INTO app_settings (key, value) VALUES ('units.crateKg', '10'::jsonb), ('recipes.childBand', '5'::jsonb)`);

    const product = async (name, unit, stockUnit, onHand, decantable = true) => {
      const p = await one(
        `INSERT INTO products (name, stock_keeping_unit, default_unit, is_decantable, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`, [name, name.toUpperCase(), unit, decantable]);
      await q('INSERT INTO stock_levels (product_id, quantity_on_hand, unit) VALUES ($1, $2, $3)', [p.id, onHand, stockUnit]);
      return p.id;
    };
    const maize = await product('Maize meal', 'kg', 'kg', 100);
    const carrots = await product('Carrots', 'kg', 'crate', 10);
    const onions = await product('Onions', 'kg', 'bag', 20);
    const beans = await product('Baked beans', 'each', 'each', 30, false);

    // Centre A: 23 children, banded to 25, on the recipe. B: no child
    // count, takes its standing order. C: keeps its own order. D: not
    // approved, so it gets no slips at all.
    const centre = async (name, children, approved = true) => (await one(
      `INSERT INTO ecd_centres (name, cohort, child_count, is_active, approved_at)
       VALUES ($1, 'tuesday', $2, true, ${approved ? 'now()' : 'NULL'}) RETURNING id`, [name, children])).id;
    const a = await centre('Centre A', 23);
    const b = await centre('Centre B', 0);
    const c = await centre('Centre C', 10);
    const d = await centre('Centre D', 50, false);
    await q('INSERT INTO recipe_own_order_centres (ecd_id) VALUES ($1)', [c]);

    // Summer and winter start the same day, so summer applies today.
    const summer = await one(
      `INSERT INTO recipes (name, kind, season_start_month, season_start_day) VALUES ('Summer', 'summer', 1, 1) RETURNING id`);
    await q(`INSERT INTO recipes (name, kind, season_start_month, season_start_day) VALUES ('Winter', 'winter', 1, 1)`);
    await q(
      `INSERT INTO recipe_lines (recipe_id, product_id, quantity_per_child, unit)
       VALUES ($1, $2, 0.5, 'kg'), ($1, $3, 1, 'kg'), ($1, $4, 0.2, 'kg')`, [summer.id, maize, carrots, onions]);

    const order = (ecd, productId, quantity, unit) => q(
      `INSERT INTO ecd_order_lines (ecd_id, product_id, quantity, unit, effective_from)
       VALUES ($1, $2, $3, $4, ${TODAY} - 30)`, [ecd, productId, quantity, unit]);
    await order(c, maize, 4, 'kg');      // counts: C keeps its own order
    await order(b, beans, 6, 'each');    // counts: B has no child count
    await order(a, beans, 100, 'each');  // ignored: A is on the recipe
    await order(d, beans, 50, 'each');   // ignored: D is not approved

    // 20 kg of maize packed on a pallet not yet collected; 5 cans of
    // beans held for an approved benevolent request.
    const slip = await one(
      `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, status) VALUES ($1, ${TODAY}, 'tuesday', 'complete') RETURNING id`, [a]);
    await q(
      `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, packed_quantity, unit, status)
       VALUES ($1, $2, 20, 20, 'kg', 'confirmed')`, [slip.id, maize]);
    const request = await one(`INSERT INTO community_requests (items_requested, outcome) VALUES ('Food parcel', 'approved') RETURNING id`);
    await q(
      `INSERT INTO community_request_items (request_id, product_id, quantity_approved, unit) VALUES ($1, $2, 5, 'each')`,
      [request.id, beans]);

    // Onions went out at 16 bags in the last eight weeks; the 50 before
    // that is outside the window.
    await q(
      `INSERT INTO stock_movements (product_id, quantity, unit, movement_type, created_at) VALUES
         ($1, -8, 'bag', 'dispatched', now() - interval '10 days'),
         ($1, -8, 'bag', 'dispatched', now() - interval '20 days'),
         ($1, -50, 'bag', 'dispatched', now() - interval '100 days')`, [onions]);

    const mills = (await one(`INSERT INTO suppliers (name) VALUES ('Cape Mills') RETURNING id`)).id;
    const fresh = (await one(`INSERT INTO suppliers (name, expected_lead_time_days) VALUES ('Fresh Co', 3) RETURNING id`)).id;
    await q('INSERT INTO supplier_products (supplier_id, product_id) VALUES ($1, $2)', [fresh, onions]);

    const po = async (supplier, status, expectedIn, raisedDaysAgo = 1, followUpOf = null) => (await one(
      `INSERT INTO purchase_orders (supplier_id, status, expected_delivery_date, created_at, follow_up_of, status_reason)
       VALUES ($1, $2, ${TODAY} + $3::int, now() - make_interval(days => $4::int), $5, $6) RETURNING id`,
      [supplier, status, expectedIn, raisedDaysAgo, followUpOf, status === 'follow_up_required' ? 'Short' : null])).id;
    const line = async (poId, productId, quantity) => (await one(
      `INSERT INTO purchase_order_items (purchase_order_id, product_id, expected_quantity) VALUES ($1, $2, $3) RETURNING id`,
      [poId, productId, quantity])).id;

    await line(await po(mills, 'approved', 7), maize, 50);      // due in a week
    await line(await po(mills, 'approved', -3), maize, 30);     // overdue

    // 20 kg of carrots ordered ten days ago, 5 kg delivered four days ago.
    const carrotPo = await po(mills, 'partially_received', 5, 10);
    const carrotLine = await line(carrotPo, carrots, 20);
    const note = await one(
      `INSERT INTO delivery_notes (supplier_id, purchase_order_id, delivery_date) VALUES ($1, $2, ${TODAY} - 4) RETURNING id`,
      [mills, carrotPo]);
    await q(
      `INSERT INTO delivery_note_items (delivery_note_id, product_id, purchase_order_item_id, received_quantity, unit)
       VALUES ($1, $2, $3, 5, 'kg')`, [note.id, carrots, carrotLine]);

    await line(await po(fresh, 'approved', 2), onions, 10);      // kilograms against bags: cannot count

    // 40 cans whose remainder moved to a follow-up order: counted once.
    const first = await po(mills, 'follow_up_required', 3);
    await line(first, beans, 40);
    await line(await po(mills, 'approved', 3, 1, first), beans, 40);
    // Only open statuses count, so the first order is out either way;
    // make it look open to prove the follow-up rule does the work.
    await q(`UPDATE purchase_orders SET status = 'approved' WHERE id = $1`, [first]);

    cover = await loadStockCover({ horizonWeeks: 8 });
  });

  afterAll(async () => {
    await resetTables(pool, TABLES);
    await q('DELETE FROM app_settings WHERE key = ANY($1::text[])', [SETTING_KEYS]);
    for (const s of savedSettings) await q('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [s.key, JSON.stringify(s.value)]);
    await pool.end();
  });

  it('uses the recipe in use', () => {
    expect(cover.recipeName).toBe('Summer');
    expect(cover.today).toBe(todayInSAST());
  });

  it('adds the recipe for centres on it to the standing orders of the rest, less committed stock', () => {
    // 0.5 kg x 25 children for A, plus C's own order of 4 kg.
    expect(item('Maize meal')).toMatchObject({
      unit: 'kg', onHand: 100, committed: 20, available: 80,
      recipeWeekly: 12.5, standingWeekly: 4, weeklyDemand: 16.5,
      demandSource: 'planned', demandLabel: 'Summer recipe and standing orders',
    });
  });

  it('counts an order on its date, and an overdue one apart', () => {
    const today = todayInSAST();
    expect(item('Maize meal')).toMatchObject({
      incoming: 50, nextDelivery: addDays(today, 7), overdue: 30, overdueOrders: 1,
      leadSource: 'assumed', leadDays: 7,
    });
    expect(item('Maize meal').limits).toContain('Overdue, chase supplier');
  });

  it('turns kilograms into crates where a crate weight is set', () => {
    // 25 kg a week is 2.5 crates; 15 kg still owed is 1.5 crates.
    expect(item('Carrots')).toMatchObject({
      unit: 'crate', recipeWeekly: 2.5, weeklyDemand: 2.5, demandSource: 'planned', incoming: 1.5,
      leadSource: 'median', leadDays: 6, leadLabel: 'Median of 1 order: 6 days', supplier: 'Cape Mills',
    });
  });

  it('falls back to dispatch history where no bag weight is set, and says so', () => {
    const onions = item('Onions');
    expect(onions).toMatchObject({
      unit: 'bag', recipeWeekly: 0, weeklyDemand: 2, demandSource: 'history', incoming: 0,
      leadSource: 'agreed', leadLabel: 'Agreed with Fresh Co: 3 days',
    });
    expect(onions.limits).toEqual([
      'Planned demand not used: 1 line in kg, no bag weight set',
      'Not counted on order: 1 order line in kg, no bag weight set',
    ]);
  });

  it('counts only the follow-up of an order that was split, and benevolent holds as committed', () => {
    expect(item('Baked beans')).toMatchObject({
      standingWeekly: 6, demandLabel: 'Standing orders', committed: 5, available: 25, incoming: 40,
    });
  });

  it('gives the Days of stock left report the same figures, with where they came from', async () => {
    const { default: ops } = await import('../../src/repositories/reportingOps.repository.js');
    const rows = await ops.daysOfCover({ filters: {}, limit: 10 });
    const maize = rows.find((r) => r.label === 'Maize meal');
    expect(maize.value).toBe(item('Maize meal').daysOfCover);
    expect(maize.meta.note).toMatch(/^Demand: Summer recipe and standing orders\. Order by .+ \(lead time: Assumed 7 days\)\. No agreed lead time or delivery history for Cape Mills\. Overdue, chase supplier$/);
    expect(rows.map((r) => r.value)).toEqual([...rows.map((r) => r.value)].sort((a, b) => a - b));
  });

  it('narrows to one programme', async () => {
    const none = await loadStockCover({ programmeId: 999999 });
    expect(none.items).toEqual([]);
  });
});
