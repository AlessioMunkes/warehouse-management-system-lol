// ─────────────────────────────────────────────────────────────
// server/src/repositories/stockCover.repository.js
//
// Everything the stock cover calculation (features/stock/stockCover.js)
// needs, one row a product, every quantity in the product's stock
// unit; and loadStockCover(), which runs the calculation over them. The
// "Days of stock left" report, the dashboard's stock outlook and the
// reorder planner all call loadStockCover, so all three read the same
// figures.
//
// Planned demand is made the way slip generation makes slips
// (picking.repository generateSlips, recipe.repository
// insertSlipItemsFromRecipeForMany): the recipe in use for each
// approved, active centre with a child count that does not keep its
// own order, banded and rounded the same way; the current standing
// order for every other approved, active centre. A line that does not
// convert to the stock unit is counted by its unit, never added in
// as it stands.
//
// Days are South African throughout.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import recipeRepository from './recipe.repository.js';
import { committedStockSql } from './committedStock.sql.js';
import { recipeForDate, COUNTED_UNITS } from '../features/recipes/recipeSeason.js';
import { SETTINGS } from '../features/settings/settingsDefinitions.js';
import { unitRatioSql } from '../features/units/unitConversion.js';
import { loadShelfLots, todayInSAST } from './shelfLots.repository.js';
import {
  coverFor, byUrgency, HISTORY_WEEKS, DEFAULT_LEAD_DAYS, DEFAULT_HORIZON_WEEKS,
} from '../features/stock/stockCover.js';

const SAST_TODAY = `(NOW() AT TIME ZONE 'Africa/Johannesburg')::date`;
const SAST = (col) => `(${col} AT TIME ZONE 'Africa/Johannesburg')`;
const OPEN_ORDER_STATUSES = ['approved', 'in_transit', 'partially_received'];
const CHILD_BAND = SETTINGS['recipes.childBand'];

/**
 * One row for each active product. `recipeId` is the recipe in use, or
 * null when none applies (then every centre takes its standing order).
 */
export const listCoverInputs = async ({ recipeId = null, childBand = 1, historyDays, programmeId = null }) => {
  const { rows } = await pool.query(
    `WITH pu AS (
       -- The unit each product is counted in: its stock row's, or for a
       -- product never stocked, the unit it is ordered in.
       SELECT p.id, COALESCE(sl.unit, p.default_unit) AS unit
         FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id
     ),
     centres AS (
       SELECT e.id,
              CEIL(e.child_count::numeric / $2::numeric) * $2::numeric AS children,
              ($1::int IS NOT NULL
                AND COALESCE(e.child_count, 0) > 0
                AND NOT EXISTS (SELECT 1 FROM recipe_own_order_centres o WHERE o.ecd_id = e.id)) AS on_recipe
         FROM ecd_centres e
        WHERE e.is_active = true AND e.approved_at IS NOT NULL
     ),
     planned AS (
       SELECT 'recipe' AS kind, rl.id AS line_id, rl.product_id, rl.unit,
              SUM(CASE WHEN rl.unit = ANY($3::text[]) OR NOT p.is_decantable
                       THEN CEIL(rl.quantity_per_child * c.children)
                       ELSE ROUND(rl.quantity_per_child * c.children, 2) END) AS quantity
         FROM recipe_lines rl
         JOIN products p ON p.id = rl.product_id AND p.archived_at IS NULL
         JOIN centres c  ON c.on_recipe
        WHERE rl.recipe_id = $1::int
        GROUP BY rl.id, rl.product_id, rl.unit
       UNION ALL
       SELECT 'standing', ol.id, ol.product_id, ol.unit, ol.quantity
         FROM ecd_order_lines ol
         JOIN centres c  ON c.id = ol.ecd_id AND NOT c.on_recipe
         JOIN products p ON p.id = ol.product_id AND p.archived_at IS NULL
        WHERE ol.effective_from <= ${SAST_TODAY}
          AND (ol.effective_to IS NULL OR ol.effective_to >= ${SAST_TODAY})
     ),
     planned_units AS (
       SELECT pl.*, ${unitRatioSql('pl.unit', 'pu.unit')} AS ratio
         FROM planned pl JOIN pu ON pu.id = pl.product_id
        WHERE pl.quantity > 0
     ),
     demand AS (
       SELECT product_id,
              SUM(quantity * ratio) FILTER (WHERE kind = 'recipe')   AS recipe_weekly,
              SUM(quantity * ratio) FILTER (WHERE kind = 'standing') AS standing_weekly
         FROM planned_units
        WHERE ratio IS NOT NULL
        GROUP BY product_id
     ),
     unconverted AS (
       SELECT product_id, json_agg(json_build_object('from', unit, 'lines', lines) ORDER BY unit) AS lines
         FROM (SELECT product_id, unit, COUNT(*)::int AS lines
                 FROM planned_units WHERE ratio IS NULL GROUP BY product_id, unit) u
        GROUP BY product_id
     ),
     dispatched AS (
       SELECT sm.product_id, SUM(-sm.quantity * COALESCE(${unitRatioSql('sm.unit', 'pu.unit')}, 1)) AS quantity
         FROM stock_movements sm JOIN pu ON pu.id = sm.product_id
        WHERE sm.movement_type = 'dispatched' AND sm.quantity < 0
          AND ${SAST('sm.created_at')}::date > ${SAST_TODAY} - $4::int
        GROUP BY sm.product_id
     ),
     owed AS (
       -- What each open order line still owes, in the unit it was ordered
       -- in. An order whose remainder has moved to a follow-up order is
       -- left out, or it would be counted twice.
       SELECT poi.product_id, p.default_unit AS unit, po.expected_delivery_date, po.created_at,
              GREATEST(poi.expected_quantity - COALESCE(r.received, 0), 0) AS quantity
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         JOIN products p         ON p.id = poi.product_id
         LEFT JOIN LATERAL (
           SELECT SUM(dni.received_quantity * COALESCE(${unitRatioSql('dni.unit', 'p.default_unit')}, 1)) AS received
             FROM delivery_note_items dni WHERE dni.purchase_order_item_id = poi.id
         ) r ON TRUE
        WHERE po.status = ANY($5::text[])
          AND NOT EXISTS (
            SELECT 1 FROM purchase_orders child
             WHERE child.follow_up_of = po.id AND child.status NOT IN ('completed', 'returned'))
     ),
     incoming AS (
       SELECT o.product_id,
              json_agg(json_build_object(
                'quantity',    o.quantity * COALESCE(${unitRatioSql('o.unit', 'pu.unit')}, 1),
                'unit',        o.unit,
                'convertible', ${unitRatioSql('o.unit', 'pu.unit')} IS NOT NULL,
                'expectedOn',  o.expected_delivery_date::text,
                'raisedOn',    ${SAST('o.created_at')}::date::text
              ) ORDER BY o.expected_delivery_date NULLS LAST) AS lines
         FROM owed o JOIN pu ON pu.id = o.product_id
        WHERE o.quantity > 0
        GROUP BY o.product_id
     ),
     latest_supplier AS (
       SELECT DISTINCT ON (poi.product_id) poi.product_id, s.name, s.expected_lead_time_days
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         JOIN suppliers s        ON s.id = po.supplier_id
        WHERE po.status <> 'returned'
        ORDER BY poi.product_id, po.created_at DESC, po.id DESC
     ),
     linked AS (
       SELECT sp.product_id,
              json_agg(json_build_object('name', s.name, 'agreedDays', s.expected_lead_time_days) ORDER BY s.name) AS suppliers
         FROM supplier_products sp
         JOIN suppliers s ON s.id = sp.supplier_id AND s.is_active = true AND s.archived_at IS NULL
        GROUP BY sp.product_id
     ),
     actual_lead AS (
       -- Days from an order being raised to its first delivery, over the
       -- last year: the Supplier lead time report's measure, by product.
       SELECT x.product_id,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x.days) AS days,
              COUNT(*)::int AS orders
         FROM (
           SELECT DISTINCT poi.product_id, po.id, d.first_delivery - ${SAST('po.created_at')}::date AS days
             FROM purchase_order_items poi
             JOIN purchase_orders po ON po.id = poi.purchase_order_id
             JOIN LATERAL (
               SELECT MIN(dn.delivery_date) AS first_delivery FROM delivery_notes dn WHERE dn.purchase_order_id = po.id
             ) d ON d.first_delivery IS NOT NULL
            WHERE po.status <> 'returned'
              AND po.created_at > NOW() - INTERVAL '365 days'
              AND d.first_delivery >= ${SAST('po.created_at')}::date
         ) x
        GROUP BY x.product_id
     )
     SELECT p.id AS product_id, p.name, pu.unit, p.programme_id,
            (pu.unit = ANY($3::text[]) OR NOT COALESCE(p.is_decantable, true)) AS whole_units,
            COALESCE(sl.quantity_on_hand, 0)  AS on_hand,
            COALESCE(c.committed, 0)          AS committed,
            COALESCE(sl.reorder_threshold, 0) AS reorder_threshold,
            COALESCE(dm.recipe_weekly, 0)     AS recipe_weekly,
            COALESCE(dm.standing_weekly, 0)   AS standing_weekly,
            uc.lines                          AS unconverted,
            COALESCE(di.quantity, 0)          AS dispatched,
            inc.lines                         AS incoming,
            ls.name                           AS supplier_name,
            ls.expected_lead_time_days        AS supplier_agreed_days,
            li.suppliers                      AS linked_suppliers,
            al.days                           AS median_lead_days,
            COALESCE(al.orders, 0)            AS lead_orders
       FROM products p
       JOIN pu ON pu.id = p.id
       LEFT JOIN stock_levels sl       ON sl.product_id = p.id
       LEFT JOIN (${committedStockSql()}) c ON c.product_id = p.id
       LEFT JOIN demand dm             ON dm.product_id = p.id
       LEFT JOIN unconverted uc        ON uc.product_id = p.id
       LEFT JOIN dispatched di         ON di.product_id = p.id
       LEFT JOIN incoming inc          ON inc.product_id = p.id
       LEFT JOIN latest_supplier ls    ON ls.product_id = p.id
       LEFT JOIN linked li             ON li.product_id = p.id
       LEFT JOIN actual_lead al        ON al.product_id = p.id
      WHERE p.is_active = true AND p.archived_at IS NULL
        AND ($6::int IS NULL OR p.programme_id = $6::int)
      ORDER BY p.name ASC`,
    [recipeId, childBand, COUNTED_UNITS, historyDays, OPEN_ORDER_STATUSES, programmeId],
  );
  return rows;
};

// The recipe slips dated `today` are made from, with the band child
// counts are rounded up to, or null when none applies (no recipe with
// lines, or the recipes cannot be read). Slip generation decides the
// same way (recipe.repository resolveForDate).
export const recipeInUse = async (today) => {
  try {
    const [recipes, band] = await Promise.all([
      recipeRepository.listRecipes(),
      pool.query(`SELECT value FROM app_settings WHERE key = 'recipes.childBand'`),
    ]);
    const recipe = recipeForDate(recipes, today);
    if (!recipe || !(recipe.lines?.length > 0)) return null;
    const stored = Number(band.rows[0]?.value);
    const usable = Number.isInteger(stored) && stored >= CHILD_BAND.min && stored <= CHILD_BAND.max;
    return { id: recipe.id, name: recipe.name, childBand: usable ? stored : CHILD_BAND.default };
  } catch (err) {
    console.error('[stock cover] Using standing orders; could not read the recipe in use:', err.message);
    return null;
  }
};

export { todayInSAST };

/** Every active product's cover, most urgent first. */
export const loadStockCover = async ({
  today = todayInSAST(), horizonWeeks = DEFAULT_HORIZON_WEEKS, programmeId = null,
} = {}) => {
  const recipe = await recipeInUse(today);
  const [rows, shelf] = await Promise.all([
    listCoverInputs({
      recipeId: recipe?.id ?? null, childBand: recipe?.childBand ?? 1,
      historyDays: HISTORY_WEEKS * 7, programmeId,
    }),
    loadShelfLots(),
  ]);
  const recipeName = recipe?.name ?? null;
  return {
    today,
    horizonWeeks,
    historyWeeks: HISTORY_WEEKS,
    defaultLeadDays: DEFAULT_LEAD_DAYS,
    recipeName,
    // Each product's estimated lots go in beside its inputs, for the
    // use-by dates (stockCover.js).
    items: rows
      .map((row) => coverFor({ ...row, lots: shelf.get(row.product_id)?.lots ?? [] }, { today, horizonWeeks, recipeName }))
      .sort(byUrgency),
  };
};

export default { listCoverInputs, recipeInUse, loadStockCover, todayInSAST };
