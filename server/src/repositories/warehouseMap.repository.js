// ─────────────────────────────────────────────────────────────
// server/src/repositories/warehouseMap.repository.js
//
// The SQL behind the warehouse map: the floor plan (warehouse_areas)
// and what managers counted in each area (warehouse_area_counts),
// migration 048. What an area holds NOW is worked out from these in
// features/warehouseMap/placement.js, not here.
//
// A warehouse database that has not had migrations 048 and 049 yet has
// no tables, or not their columns. Reads then answer null ("no plan
// yet") rather than failing, so the Inventory screen keeps working while
// the migration is waiting.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { committedStockSql } from './committedStock.sql.js';
import { UNIT_SIZE_SETTINGS } from '../features/units/unitConversion.js';
import settingsRepository from './settings.repository.js';

// No table (42P01) or no column (42703): the migration has not run.
const NOT_MIGRATED = ['42P01', '42703'];
const notMigrated = (err) => NOT_MIGRATED.includes(err.code);

const AREA_COLUMNS = `
  a.id, a.name, a.kind,
  a.grid_x AS x, a.grid_y AS y, a.grid_w AS w, a.grid_h AS h,
  a.levels, a.capacity_kg, a.pallet_spaces, a.preferred_product_ids, a.preferred_categories,
  a.updated_at`;

/** Every area on the plan, or null when the tables do not exist yet. */
const listAreas = async (db = pool) => {
  try {
    const { rows } = await db.query(
      `SELECT ${AREA_COLUMNS} FROM warehouse_areas a WHERE a.is_active ORDER BY a.id ASC`
    );
    return rows;
  } catch (err) {
    if (notMigrated(err)) return null;
    throw err;
  }
};

const getArea = async (id, db = pool) => {
  const { rows } = await db.query(
    `SELECT ${AREA_COLUMNS} FROM warehouse_areas a WHERE a.id = $1 AND a.is_active`,
    [id]
  );
  return rows[0] ?? null;
};

/**
 * The newest count of each product in each area (zero counts included:
 * they are how a product is taken out of an area).
 */
const listLatestCounts = async (db = pool) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT ON (c.area_id, c.product_id)
              c.area_id, c.product_id, c.quantity, c.unit, c.counted_at,
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS counted_by_name
         FROM warehouse_area_counts c
         JOIN warehouse_areas a ON a.id = c.area_id AND a.is_active
         LEFT JOIN users u ON u.id = c.counted_by
        ORDER BY c.area_id, c.product_id, c.counted_at DESC, c.id DESC`
    );
    return rows;
  } catch (err) {
    if (notMigrated(err)) return [];
    throw err;
  }
};

/**
 * Every active product with what is on hand, in its stock unit (the
 * catalogue unit for a product with no stock row yet), how much of that
 * is packed onto pallets not yet dispatched, and its programme.
 * Benevolent requests are left out of on_pallets: what they set aside
 * is still on the shelf until it goes out.
 */
const listMapProducts = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.stock_keeping_unit AS sku, p.storage_type,
            COALESCE(sl.quantity_on_hand, 0)::numeric AS on_hand,
            COALESCE(NULLIF(sl.unit, ''), p.default_unit, '') AS unit,
            COALESCE(c.committed, 0)::numeric AS on_pallets,
            p.category, p.weight_kg,
            pr.id AS programme_id, pr.name AS programme_name
       FROM products p
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
       LEFT JOIN (${committedStockSql({ includeBenevolent: false })}) c ON c.product_id = p.id
       LEFT JOIN programmes pr ON pr.id = p.programme_id
      WHERE p.is_active = true
      ORDER BY p.name ASC`
  );
  return rows;
};

/**
 * Packed pallets not yet dispatched: closed slips with no dispatch, or one
 * still awaiting collection. The same rule as committed stock.
 */
const listPackedPallets = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT ps.id, ps.pallet_ref, ps.dispatch_date::text AS dispatch_date,
            COALESCE(NULLIF(ps.beneficiary_name, ''), e.name) AS beneficiary
       FROM picking_slips ps
       LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
       LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
      WHERE ps.status = 'complete' AND (de.id IS NULL OR de.status = 'awaiting')
      ORDER BY ps.dispatch_date ASC, ps.id ASC`
  );
  return rows;
};

/**
 * What a crate, bag, box and punnet weigh, as saved (a punnet in grams),
 * the shape convertQuantity takes; {} when unreadable.
 */
const readUnitSizes = async (db = pool) => {
  try {
    const rows = await settingsRepository.readKeys(db, Object.values(UNIT_SIZE_SETTINGS).map((s) => s.key));
    const sizes = {};
    for (const [unit, { key }] of Object.entries(UNIT_SIZE_SETTINGS)) {
      const saved = Number(rows.find((r) => r.key === key)?.value);
      if (Number.isFinite(saved) && saved > 0) sizes[unit] = saved;
    }
    return sizes;
  } catch (err) {
    console.error('[warehouseMap] unit sizes not read:', err.message);
    return {};
  }
};

/** What a count needs about each product: its name, balance and unit. */
const productsForCount = async (productIds, db = pool) => {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.is_active,
            COALESCE(sl.quantity_on_hand, 0)::numeric AS on_hand,
            COALESCE(NULLIF(sl.unit, ''), p.default_unit, '') AS unit
       FROM products p
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.id = ANY($1::int[])`,
    [productIds]
  );
  return rows;
};

/**
 * Writes the whole plan: areas with an id that is on the plan are
 * updated, the rest are added, and areas on the plan but not in
 * `areas` are taken off it (made inactive). Run inside the caller's
 * transaction.
 */
const saveLayout = async (client, areas, userId) => {
  const { rows: current } = await client.query(
    `SELECT id FROM warehouse_areas WHERE is_active FOR UPDATE`
  );
  const onPlan = new Set(current.map((r) => r.id));
  const kept = areas.filter((a) => a.id !== null && onPlan.has(a.id));
  const keptIds = kept.map((a) => a.id);

  await client.query(
    `UPDATE warehouse_areas
        SET is_active = false, updated_by = $2, updated_at = NOW()
      WHERE is_active AND NOT (id = ANY($1::int[]))`,
    [keptIds, userId]
  );

  // Names are unique on the plan, so two areas swapping names would
  // clash halfway through. Clear the kept ones' names first.
  if (keptIds.length > 0) {
    await client.query(
      `UPDATE warehouse_areas SET name = '#' || id WHERE id = ANY($1::int[])`,
      [keptIds]
    );
  }

  for (const a of kept) {
    await client.query(
      `UPDATE warehouse_areas
          SET name = $2, kind = $3, grid_x = $4, grid_y = $5, grid_w = $6, grid_h = $7,
              levels = $8, capacity_kg = $10, pallet_spaces = $11,
              preferred_product_ids = $12, preferred_categories = $13,
              updated_by = $9, updated_at = NOW()
        WHERE id = $1`,
      [a.id, a.name, a.kind, a.x, a.y, a.w, a.h, a.levels, userId,
        a.capacityKg, a.palletSpaces, a.preferredProductIds, a.preferredCategories]
    );
  }

  for (const a of areas.filter((x) => !keptIds.includes(x.id))) {
    await client.query(
      `INSERT INTO warehouse_areas
         (name, kind, grid_x, grid_y, grid_w, grid_h, levels, created_by, updated_by,
          capacity_kg, pallet_spaces, preferred_product_ids, preferred_categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12)`,
      [a.name, a.kind, a.x, a.y, a.w, a.h, a.levels, userId,
        a.capacityKg, a.palletSpaces, a.preferredProductIds, a.preferredCategories]
    );
  }
};

/** The newest count of each product in one area. */
const latestCountsForArea = async (areaId, db = pool) => {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (product_id) product_id, quantity
       FROM warehouse_area_counts
      WHERE area_id = $1
      ORDER BY product_id, counted_at DESC, id DESC`,
    [areaId]
  );
  return rows;
};

/** lines: [{ productId, quantity, unit, onHand }], one counted_at for all. */
const insertCounts = async (client, { areaId, lines, countedBy }) => {
  for (const line of lines) {
    await client.query(
      `INSERT INTO warehouse_area_counts (area_id, product_id, quantity, unit, on_hand_at_count, counted_by, counted_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [areaId, line.productId, line.quantity, line.unit, line.onHand, countedBy]
    );
  }
};

export default {
  listAreas, getArea, listLatestCounts, listMapProducts, listPackedPallets, readUnitSizes, productsForCount, saveLayout,
  latestCountsForArea, insertCounts,
};
