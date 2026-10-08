// ─────────────────────────────────────────────────────────────
// server/src/repositories/recipe.repository.js
//
// Recipes (migration 038): what picking slips are made from. SQL only —
// which recipe applies on a date is worked out in recipeSeason.js, and
// what may be saved is recipe.service.js's business.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { recipeForDate, COUNTED_UNITS } from '../features/recipes/recipeSeason.js';
import { SETTINGS } from '../features/settings/settingsDefinitions.js';

const CHILD_BAND = SETTINGS['recipes.childBand'];

const RECIPE_COLUMNS = `
  r.id, r.name, r.kind, r.season_start_month, r.season_start_day,
  r.starts_on::text AS starts_on, r.ends_on::text AS ends_on, r.updated_at`;

const withLines = (recipes, lines) => recipes.map((recipe) => ({
  ...recipe,
  lines: lines.filter((line) => line.recipe_id === recipe.id),
}));

// Every recipe with its lines: summer, winter, then overrides by date.
const listRecipes = async (db = pool) => {
  const [recipes, lines] = await Promise.all([
    db.query(
      `SELECT ${RECIPE_COLUMNS}
         FROM recipes r
        ORDER BY CASE r.kind WHEN 'summer' THEN 0 WHEN 'winter' THEN 1 ELSE 2 END,
                 r.starts_on ASC NULLS FIRST, r.id ASC`
    ),
    db.query(
      `SELECT rl.id, rl.recipe_id, rl.product_id, rl.quantity_per_child, rl.unit,
              p.name AS product_name, p.archived_at IS NOT NULL AS product_archived
         FROM recipe_lines rl
         JOIN products p ON p.id = rl.product_id
        ORDER BY p.name ASC`
    ),
  ]);
  return withLines(recipes.rows, lines.rows);
};

const getRecipeById = async (id, db = pool) => {
  const { rows } = await db.query(`SELECT ${RECIPE_COLUMNS} FROM recipes r WHERE r.id = $1`, [id]);
  return rows[0] ?? null;
};

// The ids in `productIds` that are not active products.
const missingProducts = async (productIds, db = pool) => {
  if (productIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT id FROM products WHERE id = ANY($1::int[]) AND archived_at IS NULL`,
    [productIds]
  );
  const found = new Set(rows.map((r) => r.id));
  return productIds.filter((id) => !found.has(id));
};

const replaceLines = async (client, recipeId, lines) => {
  await client.query('DELETE FROM recipe_lines WHERE recipe_id = $1', [recipeId]);
  for (const line of lines) {
    await client.query(
      `INSERT INTO recipe_lines (recipe_id, product_id, quantity_per_child, unit)
       VALUES ($1, $2, $3, $4)`,
      [recipeId, line.productId, line.quantityPerChild, line.unit]
    );
  }
};

const inTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const createOverride = ({ name, startsOn, endsOn, lines, userId }) => inTransaction(async (client) => {
  const { rows } = await client.query(
    `INSERT INTO recipes (name, kind, starts_on, ends_on, created_by)
     VALUES ($1, 'override', $2::date, $3::date, $4)
     RETURNING id`,
    [name, startsOn, endsOn, userId ?? null]
  );
  await replaceLines(client, rows[0].id, lines);
  return rows[0].id;
});

// `fields` holds only what this kind of recipe may change: a name and
// dates for an override, nothing for a season (its start is setSeasonStarts).
const updateRecipe = (id, { name, startsOn, endsOn, lines }) => inTransaction(async (client) => {
  if (name !== undefined) {
    await client.query(
      `UPDATE recipes SET name = $2, starts_on = $3::date, ends_on = $4::date, updated_at = NOW() WHERE id = $1`,
      [id, name, startsOn, endsOn]
    );
  } else {
    await client.query('UPDATE recipes SET updated_at = NOW() WHERE id = $1', [id]);
  }
  await replaceLines(client, id, lines);
});

const deleteOverride = async (id) => {
  const { rowCount } = await pool.query(`DELETE FROM recipes WHERE id = $1 AND kind = 'override'`, [id]);
  return rowCount > 0;
};

const setSeasonStarts = ({ summer, winter }) => inTransaction(async (client) => {
  for (const [kind, start] of [['summer', summer], ['winter', winter]]) {
    await client.query(
      `UPDATE recipes SET season_start_month = $2, season_start_day = $3, updated_at = NOW() WHERE kind = $1`,
      [kind, start.month, start.day]
    );
  }
});

// ── Centres that keep their own standing order ────────────────
const listOwnOrderCentres = async (db = pool) => {
  const { rows } = await db.query(
    `SELECT e.id, e.name, e.child_count
       FROM recipe_own_order_centres o
       JOIN ecd_centres e ON e.id = o.ecd_id
      ORDER BY e.name ASC`
  );
  return rows;
};

const missingCentres = async (ecdIds, db = pool) => {
  if (ecdIds.length === 0) return [];
  const { rows } = await db.query(`SELECT id FROM ecd_centres WHERE id = ANY($1::int[])`, [ecdIds]);
  const found = new Set(rows.map((r) => r.id));
  return ecdIds.filter((id) => !found.has(id));
};

const setOwnOrderCentres = (ecdIds, userId) => inTransaction(async (client) => {
  await client.query('DELETE FROM recipe_own_order_centres WHERE NOT (ecd_id = ANY($1::int[]))', [ecdIds]);
  for (const ecdId of ecdIds) {
    await client.query(
      `INSERT INTO recipe_own_order_centres (ecd_id, added_by) VALUES ($1, $2)
       ON CONFLICT (ecd_id) DO NOTHING`,
      [ecdId, userId ?? null]
    );
  }
});

// ── For slip generation ───────────────────────────────────────
// The recipe a slip dated `dispatchDate` is made from, or null when
// there is none to use: no recipe with lines applies, or this database
// has no recipe tables yet (a warehouse not migrated to 038).
//
// Runs on the caller's transaction, inside a savepoint: a failed query
// would otherwise poison that transaction and take slip generation down
// with it, and food is never blocked on a data problem.
const resolveForDate = async (client, dispatchDate) => {
  await client.query('SAVEPOINT recipe_lookup');
  try {
    const { rows } = await client.query(
      `SELECT r.id, r.name, r.kind, r.season_start_month, r.season_start_day,
              r.starts_on::text AS starts_on, r.ends_on::text AS ends_on,
              (SELECT COUNT(*)::int FROM recipe_lines rl WHERE rl.recipe_id = r.id) AS line_count
         FROM recipes r`
    );
    // The band child counts are rounded up to (Settings → Recipes). Read
    // here, on the same connection, so a slip and its band come from one
    // look at the database. Anything unusable falls back to the default.
    const stored = await client.query(`SELECT value FROM app_settings WHERE key = 'recipes.childBand'`);
    await client.query('RELEASE SAVEPOINT recipe_lookup');

    const recipe = recipeForDate(rows, dispatchDate);
    if (!recipe || recipe.line_count === 0) return null;

    const band = Number(stored.rows[0]?.value);
    const usable = Number.isInteger(band) && band >= CHILD_BAND.min && band <= CHILD_BAND.max;
    return { ...recipe, child_band: usable ? band : CHILD_BAND.default };
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT recipe_lookup');
    console.error('[recipes] Using standing orders; could not read recipes:', err.message);
    return null;
  }
};

// Writes one slip's items from a recipe: each line times the centre's
// child count, with the count first rounded UP to a multiple of
// `childBand` (bandedChildCount in recipeSeason.js is the same sum).
// A line in a counted unit — cans, bags — is rounded up to a whole one
// (slipQuantity in recipeSeason.js).
// Writes nothing — and the caller falls back to the standing order —
// for a centre that keeps its own order or has no child count.
const insertSlipItemsFromRecipe = async (client, { slipId, ecdId, recipeId, childBand = CHILD_BAND.default }) => {
  const { rowCount } = await client.query(
    `WITH centre AS (
       SELECT e.id, CEIL(e.child_count::numeric / $4::numeric) * $4::numeric AS children
         FROM ecd_centres e
        WHERE e.id = $2
          AND COALESCE(e.child_count, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM recipe_own_order_centres o WHERE o.ecd_id = e.id)
     )
     INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
     SELECT $1, line.product_id, line.quantity, line.unit
       FROM (
         SELECT rl.product_id, rl.unit,
                CASE WHEN rl.unit = ANY($5::text[])
                     THEN CEIL(rl.quantity_per_child * c.children)
                     ELSE ROUND(rl.quantity_per_child * c.children, 2)
                END AS quantity
           FROM recipe_lines rl
           JOIN products p ON p.id = rl.product_id
           CROSS JOIN centre c
          WHERE rl.recipe_id = $3
            AND p.archived_at IS NULL
       ) line
      WHERE line.quantity > 0
     RETURNING id`,
    [slipId, ecdId, recipeId, childBand, COUNTED_UNITS]
  );
  return rowCount;
};

export default {
  listRecipes, getRecipeById, missingProducts, createOverride, updateRecipe, deleteOverride,
  setSeasonStarts, listOwnOrderCentres, missingCentres, setOwnOrderCentres,
  resolveForDate, insertSlipItemsFromRecipe,
};
