// ─────────────────────────────────────────────────────────────
// server/src/repositories/productBarcode.repository.js
//
// The product_barcodes table (migration 052): which product each
// printed barcode means, and how many of that product's unit one scan
// counts for.
//
// Codes arrive here already normalised (utils/barcode.js). Nothing in
// this file reshapes one.
//
// Linking and removing write an audit row on the PRODUCT, in the same
// transaction: a barcode decides what a scan at the bay puts into
// stock, so who pointed which code at which product is BR-04's
// business, the same as any other change to master data.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

const BARCODE_COLUMNS = `
  pb.id, pb.product_id, pb.code, pb.units_per_scan, pb.supplier_id,
  s.name AS supplier_name, pb.created_by, pb.created_at`;

// One code, with the product it points at. The product's own fields are
// what a scanning screen needs to fill a line: its name, SKU, unit and
// whether it can still be received at all.
const findByCode = async (code) => {
  const { rows } = await pool.query(
    `SELECT ${BARCODE_COLUMNS},
            p.name AS product_name, p.stock_keeping_unit AS sku,
            p.default_unit, p.is_active, p.archived_at
       FROM product_barcodes pb
       JOIN products p ON p.id = pb.product_id
       LEFT JOIN suppliers s ON s.id = pb.supplier_id
      WHERE pb.code = $1`,
    [code],
  );
  return rows[0] ?? null;
};

const listForProduct = async (productId) => {
  const { rows } = await pool.query(
    `SELECT ${BARCODE_COLUMNS}
       FROM product_barcodes pb
       LEFT JOIN suppliers s ON s.id = pb.supplier_id
      WHERE pb.product_id = $1
      ORDER BY pb.created_at ASC, pb.id ASC`,
    [productId],
  );
  return rows;
};

const readOne = async (client, id) => (await client.query(
  `SELECT ${BARCODE_COLUMNS}
     FROM product_barcodes pb
     LEFT JOIN suppliers s ON s.id = pb.supplier_id
    WHERE pb.id = $1`,
  [id],
)).rows[0] ?? null;

// The unique index on code is the guarantee that one code means one
// product. A clash comes back to the service as 23505.
const create = async ({ productId, code, unitsPerScan = 1, supplierId = null, createdBy = null }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO product_barcodes (product_id, code, units_per_scan, supplier_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [productId, code, unitsPerScan, supplierId, createdBy],
    );
    const created = await readOne(client, rows[0].id);
    await logAudit(client, {
      entityType: 'product',
      entityId:   productId,
      action:     'barcode_linked',
      actorId:    createdBy,
      after:      created,
    });
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Scoped to the product in the URL, so a barcode id from another
// product's panel cannot remove something it was not showing.
const remove = async ({ productId, barcodeId, actorId = null }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await readOne(client, barcodeId);
    if (!before || Number(before.product_id) !== Number(productId)) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('DELETE FROM product_barcodes WHERE id = $1', [barcodeId]);
    await logAudit(client, {
      entityType: 'product',
      entityId:   productId,
      action:     'barcode_removed',
      actorId,
      before,
    });
    await client.query('COMMIT');
    return before;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Every link, with its product, for a phone to keep a copy of: a scan
// at a bay with no signal is answered from that copy. Only products
// still in the catalogue; a code on one that left it is answered by
// findByCode with the server's own word.
const listAll = async () => {
  const { rows } = await pool.query(
    `SELECT pb.id, pb.product_id, pb.code, pb.units_per_scan,
            p.name AS product_name, p.stock_keeping_unit AS sku,
            p.default_unit, p.is_active, p.archived_at
       FROM product_barcodes pb
       JOIN products p ON p.id = pb.product_id
      WHERE p.is_active = true AND p.archived_at IS NULL
      ORDER BY pb.code`,
  );
  return rows;
};

// One scan's outcome (migration 053). Fire and forget from the floor.
const recordScan = async ({ screen, outcome, productId = null, referenceId = null, userId = null }) => {
  await pool.query(
    `INSERT INTO barcode_scan_events (screen, outcome, product_id, reference_id, user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [screen, outcome, productId, referenceId, userId],
  );
};

// Every stock item a new barcode could belong to, with what Open Food
// Facts said about the barcodes already on it (migration 056), for
// features/barcodeMatch. Placeholders made for unrecognised donations
// (inactive, PENDING- codes) and products out of the catalogue are
// never a suggestion.
const listMatchCandidates = async () => {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.stock_keeping_unit AS sku, p.weight_kg,
            COALESCE(
              json_agg(json_build_object(
                'foodName', pb.food_name, 'foodBrand', pb.food_brand,
                'foodWeightKg', pb.food_weight_kg, 'foodCategories', pb.food_categories
              )) FILTER (WHERE pb.id IS NOT NULL),
              '[]'::json
            ) AS barcodes
       FROM products p
       LEFT JOIN product_barcodes pb ON pb.product_id = p.id
      WHERE p.is_active = true
        AND p.archived_at IS NULL
        AND p.stock_keeping_unit NOT ILIKE 'PENDING-%'
      GROUP BY p.id
      ORDER BY p.name`,
  );
  return rows;
};

// What Open Food Facts said about one linked code, or that it said
// nothing (food = null): either way it is not asked again.
const saveFoodFacts = async (barcodeId, food) => {
  await pool.query(
    `UPDATE product_barcodes
        SET food_name = $2, food_brand = $3, food_quantity = $4,
            food_weight_kg = $5, food_categories = $6, food_checked_at = now()
      WHERE id = $1`,
    [
      barcodeId,
      food?.productName ?? null, food?.brand ?? null, food?.quantity ?? null,
      food?.weightKg ?? null, food?.categories?.length ? food.categories : null,
    ],
  );
};

export default {
  findByCode, listForProduct, listAll, create, remove, recordScan, listMatchCandidates, saveFoodFacts,
};
