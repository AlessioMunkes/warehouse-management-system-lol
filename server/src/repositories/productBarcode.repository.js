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

export default { findByCode, listForProduct, create, remove };
