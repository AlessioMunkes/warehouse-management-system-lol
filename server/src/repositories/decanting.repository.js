// ── Expected schema (add as a migration if not present) ──────
//
//   CREATE TABLE decanting_records (
//     id          SERIAL PRIMARY KEY,
//     week_of     DATE        NOT NULL,          -- the dispatch week this run covers
//     notes       TEXT,
//     recorded_by INTEGER     REFERENCES users(id),
//     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//
//   CREATE TABLE decanting_lines (
//     id             SERIAL PRIMARY KEY,
//     decanting_id   INTEGER NOT NULL REFERENCES decanting_records(id) ON DELETE CASCADE,
//     product_id     INTEGER REFERENCES products(id),
//     required_kg    NUMERIC(10,3) NOT NULL,     -- weight to dispatch this week
//     actual_bulk_kg NUMERIC(10,3),              -- weighed bulk available
//     packed_kg      NUMERIC(10,3) NOT NULL,     -- weight the bag plan adds up to
//     total_bags     INTEGER       NOT NULL,
//     sizes_kg       JSONB         NOT NULL,     -- e.g. [5, 2.5, 1, 0.5, 0.25]
//     bags           JSONB         NOT NULL,     -- e.g. {"5kg":2,"2.5kg":0,"1kg":0}
//     margin_error   NUMERIC(6,4)  NOT NULL,     -- fraction, 0.0032 = 0.32 %
//     within_margin  BOOLEAN       NOT NULL,
//     wastage_kg     NUMERIC(10,3) NOT NULL DEFAULT 0,
//     surplus_kg     NUMERIC(10,3) NOT NULL DEFAULT 0,
//     shortfall_kg   NUMERIC(10,3) NOT NULL DEFAULT 0,
//     notes          TEXT
//   );
//
//   -- flag which products get decanted (dry goods: rice, oats, sugar, soya)
//   ALTER TABLE products ADD COLUMN IF NOT EXISTS is_decantable BOOLEAN NOT NULL DEFAULT false;
//
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// ── Create a decanting record with its lines ──────────────────
// Wrapped in a transaction so a header is never left without lines.
// Decanting records are write-once — there is no update / delete.
const createDecanting = async ({ weekOf, notes, recordedBy, lines }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert the header row
    const headerResult = await client.query(
      `INSERT INTO decanting_records
         (week_of, notes, recorded_by, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [weekOf, notes || null, recordedBy]
    );
    const record = headerResult.rows[0];

    // Insert each product line
    for (const line of lines) {
      await client.query(
        `INSERT INTO decanting_lines
           (decanting_id, product_id, required_kg, actual_bulk_kg, packed_kg,
            total_bags, sizes_kg, bags, margin_error, within_margin,
            wastage_kg, surplus_kg, shortfall_kg, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          record.id,
          line.productId ?? null,
          line.requiredKg,
          line.actualBulkKg ?? null,
          line.packedKg,
          line.totalBags,
          JSON.stringify(line.sizesKg ?? []),
          JSON.stringify(line.bags ?? {}),
          line.marginError,
          line.withinMargin,
          line.wastageKg   ?? 0,
          line.surplusKg   ?? 0,
          line.shortfallKg ?? 0,
          line.notes ?? null,
        ]
      );
    }

    await client.query('COMMIT');

    // Return the freshly-saved record with its lines
    return await getDecantingById(record.id);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Get decanting records with roll-up totals ─────────────────
// range: 'today' | 'week' | 'month' | 'all'
const getDecantingRecords = async (range = 'all') => {
  let dateFilter = '';

  if (range === 'today') {
    dateFilter = `AND dr.created_at::date = CURRENT_DATE`;
  } else if (range === 'week') {
    dateFilter = `AND dr.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
  } else if (range === 'month') {
    dateFilter = `AND dr.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
  }

  const result = await pool.query(
    `SELECT
       dr.id,
       dr.week_of,
       dr.notes,
       dr.created_at,
       u.first_name                     AS recorded_by_name,
       COUNT(dl.id)                     AS line_count,
       COALESCE(SUM(dl.total_bags), 0)  AS total_bags,
       COALESCE(SUM(dl.required_kg), 0) AS total_required_kg,
       COALESCE(SUM(dl.packed_kg), 0)   AS total_packed_kg,
       COALESCE(SUM(dl.wastage_kg), 0)  AS total_wastage_kg,
       COALESCE(SUM(dl.surplus_kg), 0)  AS total_surplus_kg,
       COALESCE(SUM(dl.shortfall_kg), 0) AS total_shortfall_kg
     FROM decanting_records dr
     LEFT JOIN users u          ON u.id = dr.recorded_by
     LEFT JOIN decanting_lines dl ON dl.decanting_id = dr.id
     WHERE 1=1 ${dateFilter}
     GROUP BY dr.id, u.first_name
     ORDER BY dr.created_at DESC`
  );

  return result.rows;
};

// ── Get a single decanting record with all its lines ──────────
const getDecantingById = async (id) => {
  const recordResult = await pool.query(
    `SELECT
       dr.id,
       dr.week_of,
       dr.notes,
       dr.created_at,
       u.first_name AS recorded_by_name
     FROM decanting_records dr
     LEFT JOIN users u ON u.id = dr.recorded_by
     WHERE dr.id = $1`,
    [id]
  );

  if (recordResult.rows.length === 0) return null;

  const linesResult = await pool.query(
    `SELECT
       dl.id,
       dl.product_id,
       dl.required_kg,
       dl.actual_bulk_kg,
       dl.packed_kg,
       dl.total_bags,
       dl.sizes_kg,
       dl.bags,
       dl.margin_error,
       dl.within_margin,
       dl.wastage_kg,
       dl.surplus_kg,
       dl.shortfall_kg,
       dl.notes,
       p.name               AS product_name,
       p.stock_keeping_unit AS sku
     FROM decanting_lines dl
     LEFT JOIN products p ON p.id = dl.product_id
     WHERE dl.decanting_id = $1
     ORDER BY p.name ASC`,
    [id]
  );

  return {
    ...recordResult.rows[0],
    lines: linesResult.rows,
  };
};

// ── Weekly procurement report ─────────────────────────────────
// Aggregates required / packed / bulk / wastage / surplus / shortfall
// per product for the given dispatch week, so procurement can adjust
// bulk purchasing.
const getWeeklyProcurementReport = async (weekOf) => {
  const result = await pool.query(
    `SELECT
       p.id                               AS product_id,
       p.name                             AS product_name,
       p.stock_keeping_unit               AS sku,
       COALESCE(SUM(dl.required_kg), 0)   AS total_required_kg,
       COALESCE(SUM(dl.packed_kg), 0)     AS total_packed_kg,
       COALESCE(SUM(dl.actual_bulk_kg), 0) AS total_bulk_kg,
       COALESCE(SUM(dl.wastage_kg), 0)    AS total_wastage_kg,
       COALESCE(SUM(dl.surplus_kg), 0)    AS total_surplus_kg,
       COALESCE(SUM(dl.shortfall_kg), 0)  AS total_shortfall_kg,
       COALESCE(SUM(dl.total_bags), 0)    AS total_bags
     FROM decanting_lines dl
     JOIN decanting_records dr ON dr.id = dl.decanting_id
     LEFT JOIN products p      ON p.id = dl.product_id
     WHERE dr.week_of = $1
     GROUP BY p.id, p.name, p.stock_keeping_unit
     ORDER BY p.name ASC`,
    [weekOf]
  );

  return result.rows;
};


export default {
  createDecanting,
  getDecantingRecords,
  getDecantingById,
  getWeeklyProcurementReport,
};